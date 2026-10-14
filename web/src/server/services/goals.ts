import "server-only";
import { z } from "zod";
import { db } from "../db";
import { notFound } from "../errors";
import { addDays, weekStart } from "@/lib/dates";
import { zDate } from "../http";
import { estimate1RM } from "@/lib/workout-generator";

export const GOAL_TYPES = {
  workouts_per_week: { label: "Workouts per week", unit: "workouts", period: "week" },
  workouts_total: { label: "Complete a number of workouts", unit: "workouts", period: "total" },
  water_daily: { label: "Drink water daily", unit: "ml", period: "day" },
  steps_daily: { label: "Daily steps", unit: "steps", period: "day" },
  distance_weekly: { label: "Walk/run/cycle distance per week", unit: "km", period: "week" },
  sleep_daily: { label: "Sleep duration", unit: "hours", period: "day" },
  exercise_weight: { label: "Improve a specific exercise", unit: "kg", period: "total" },
  custom: { label: "Custom habit (check off yourself)", unit: "done", period: "total" },
} as const;
export type GoalType = keyof typeof GOAL_TYPES;

export const goalSchema = z.object({
  type: z.enum(Object.keys(GOAL_TYPES) as [GoalType, ...GoalType[]]),
  title: z.string().trim().min(1).max(100),
  target: z.number().positive().max(1_000_000),
  exerciseId: z.string().nullable().optional(),
  startDate: zDate,
  endDate: zDate.nullable().optional(),
});

export const goalUpdateSchema = goalSchema.partial().extend({ status: z.enum(["active", "paused", "completed", "archived"]).optional() });

export async function createGoal(userId: string, input: z.infer<typeof goalSchema>) {
  return db.goal.create({ data: { userId, ...input, unit: GOAL_TYPES[input.type].unit } });
}

export async function updateGoal(userId: string, id: string, input: z.infer<typeof goalUpdateSchema>) {
  const g = await db.goal.findFirst({ where: { id, userId } });
  if (!g) throw notFound("goal");
  return db.goal.update({ where: { id }, data: { ...input, ...(input.type ? { unit: GOAL_TYPES[input.type].unit } : {}) } });
}

export async function deleteGoal(userId: string, id: string) {
  const { count } = await db.goal.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("goal");
}

/** Current progress for a goal, computed from real records. */
async function goalProgress(userId: string, g: { type: string; target: number; exerciseId: string | null; startDate: string; status: string }, today: string) {
  const wk = weekStart(today);
  switch (g.type as GoalType) {
    case "workouts_per_week": {
      const n = await db.workoutSession.count({ where: { userId, status: "completed", date: { gte: wk, lte: today } } });
      return { current: n, label: `${n} of ${g.target} this week` };
    }
    case "workouts_total": {
      const n = await db.workoutSession.count({ where: { userId, status: "completed", date: { gte: g.startDate } } });
      return { current: n, label: `${n} of ${g.target} since ${g.startDate}` };
    }
    case "water_daily": {
      const r = await db.waterEntry.aggregate({ where: { userId, date: today }, _sum: { amountMl: true } });
      const v = r._sum.amountMl ?? 0;
      return { current: v, label: `${v} of ${g.target} ml today` };
    }
    case "steps_daily": {
      const r = await db.dailyMetric.findMany({ where: { userId, date: today, metric: "steps" } });
      const v = r.length ? Math.max(...r.map((x) => x.value)) : 0;
      return { current: v, label: r.length ? `${v.toLocaleString()} of ${g.target.toLocaleString()} steps today` : "No steps recorded today" };
    }
    case "distance_weekly": {
      const r = await db.activity.aggregate({ where: { userId, date: { gte: wk, lte: today }, type: { in: ["walking", "running", "cycling", "hiking"] } }, _sum: { distanceM: true } });
      const km = Math.round(((r._sum.distanceM ?? 0) / 1000) * 10) / 10;
      return { current: km, label: `${km} of ${g.target} km this week` };
    }
    case "sleep_daily": {
      const s = await db.sleepEntry.findFirst({ where: { userId, date: today }, orderBy: { source: "desc" } });
      const h = s ? Math.round((s.durationMin / 60) * 10) / 10 : 0;
      return { current: h, label: s ? `${h} of ${g.target} h last night` : "No sleep logged for last night" };
    }
    case "exercise_weight": {
      if (!g.exerciseId) return { current: 0, label: "Choose an exercise" };
      const sets = await db.workoutSet.findMany({ where: { exerciseId: g.exerciseId, completed: true, session: { userId, status: "completed" } }, select: { weightKg: true, reps: true } });
      const best = Math.max(0, ...sets.map((s) => s.weightKg ?? 0));
      const best1 = Math.max(0, ...sets.filter((s) => s.weightKg && s.reps).map((s) => estimate1RM(s.weightKg!, s.reps!)));
      return { current: best, label: `Best ${best} kg (est. 1RM ${best1} kg) — target ${g.target} kg` };
    }
    case "custom":
      return { current: g.status === "completed" ? g.target : 0, label: g.status === "completed" ? "Done" : "Mark as done when you've achieved it" };
  }
}

export async function listGoals(userId: string, today: string) {
  const goals = await db.goal.findMany({ where: { userId, status: { not: "archived" } }, orderBy: { createdAt: "desc" } });
  const exs = await db.exercise.findMany({ where: { id: { in: goals.map((g) => g.exerciseId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  return Promise.all(
    goals.map(async (g) => {
      const p = await goalProgress(userId, g, today);
      const pct = Math.min(100, Math.round((p.current / g.target) * 100));
      return { ...g, ...p, percent: pct, met: p.current >= g.target, period: GOAL_TYPES[g.type as GoalType]?.period ?? "total", exerciseName: exs.find((e) => e.id === g.exerciseId)?.name ?? null };
    }),
  );
}

/** Daily goal completion rate over a range (for charts): share of active daily goals met per day. */
export async function goalCompletionSeries(userId: string, start: string, end: string) {
  const profile = await db.profile.findUnique({ where: { userId } });
  const [water, steps, sleep] = await Promise.all([
    db.waterEntry.groupBy({ by: ["date"], where: { userId, date: { gte: start, lte: end } }, _sum: { amountMl: true } }),
    db.dailyMetric.findMany({ where: { userId, metric: "steps", date: { gte: start, lte: end } } }),
    db.sleepEntry.findMany({ where: { userId, date: { gte: start, lte: end } } }),
  ]);
  const out: { date: string; met: number; tracked: number }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    let met = 0;
    let tracked = 0;
    const w = water.find((x) => x.date === d)?._sum.amountMl;
    if (w != null) {
      tracked++;
      if (w >= (profile?.waterTargetMl ?? 2000)) met++;
    }
    const st = steps.filter((x) => x.date === d);
    if (st.length && profile?.stepTarget) {
      tracked++;
      if (Math.max(...st.map((x) => x.value)) >= profile.stepTarget) met++;
    }
    const sl = sleep.find((x) => x.date === d);
    if (sl && profile?.sleepTargetMin) {
      tracked++;
      if (sl.durationMin >= profile.sleepTargetMin - 15) met++;
    }
    out.push({ date: d, met, tracked });
  }
  return out;
}
