import "server-only";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { addDays, diffDays } from "@/lib/dates";
import { flexibleDailyStreak, levelFromXp, weeklyStreak } from "@/lib/streaks";

// ───────── Achievements: awarded ONLY from recorded data ─────────

type Counts = {
  workouts: number;
  recipes: number;
  mealDays: number;
  foodEntries: number;
  activities: number;
  hydrationDaysMet: number;
  longestLoggingStreak: number;
  prCount: number;
  activeDays: number;
};

export const ACHIEVEMENTS: { key: string; title: string; description: string; icon: string; earned: (c: Counts) => boolean }[] = [
  { key: "first_meal", title: "First meal logged", description: "You logged your first meal.", icon: "🍽️", earned: (c) => c.foodEntries >= 1 },
  { key: "first_workout", title: "First workout", description: "You completed your first workout.", icon: "💪", earned: (c) => c.workouts >= 1 },
  { key: "first_recipe", title: "Home cook", description: "You created your first recipe.", icon: "👩‍🍳", earned: (c) => c.recipes >= 1 },
  { key: "first_activity", title: "On the move", description: "You logged your first sport or activity.", icon: "🏃", earned: (c) => c.activities >= 1 },
  { key: "streak_7", title: "7-day streak", description: "You logged something 7 days in a row (flex days allowed).", icon: "🔥", earned: (c) => c.longestLoggingStreak >= 7 },
  { key: "workouts_10", title: "10 workouts", description: "10 workouts completed.", icon: "🏅", earned: (c) => c.workouts >= 10 },
  { key: "workouts_50", title: "50 workouts", description: "50 workouts completed.", icon: "🏆", earned: (c) => c.workouts >= 50 },
  { key: "personal_record", title: "Personal record", description: "You beat one of your own records.", icon: "📈", earned: (c) => c.prCount >= 1 },
  { key: "meals_100", title: "100 meals logged", description: "100 food entries recorded.", icon: "📒", earned: (c) => c.foodEntries >= 100 },
  { key: "hydration_7", title: "Consistent hydration", description: "Reached your water target on 7 days.", icon: "💧", earned: (c) => c.hydrationDaysMet >= 7 },
  { key: "consistency_30", title: "Long-term consistency", description: "Active on 30 different days.", icon: "🌱", earned: (c) => c.activeDays >= 30 },
];

async function activeDaySets(userId: string) {
  const [food, water, workouts, acts, sleep, wb] = await Promise.all([
    db.foodLogEntry.findMany({ where: { userId }, distinct: ["date"], select: { date: true } }),
    db.waterEntry.groupBy({ by: ["date"], where: { userId }, _sum: { amountMl: true } }),
    db.workoutSession.findMany({ where: { userId, status: "completed" }, select: { date: true } }),
    db.activity.findMany({ where: { userId }, select: { date: true } }),
    db.sleepEntry.findMany({ where: { userId }, distinct: ["date"], select: { date: true } }),
    db.wellbeingEntry.findMany({ where: { userId }, select: { date: true } }),
  ]);
  const profile = await db.profile.findUnique({ where: { userId }, select: { waterTargetMl: true } });
  const target = profile?.waterTargetMl ?? 2000;
  const mealDays = new Set(food.map((f) => f.date));
  const hydrationMet = new Set(water.filter((w) => (w._sum.amountMl ?? 0) >= target).map((w) => w.date));
  const workoutDays = workouts.map((w) => w.date);
  const movementDays = new Set([...workoutDays, ...acts.map((a) => a.date)]);
  const anyDays = new Set([...mealDays, ...water.map((w) => w.date), ...movementDays, ...sleep.map((s) => s.date), ...wb.map((w) => w.date)]);
  return { mealDays, hydrationMet, workoutDays, movementDays, anyDays };
}

function longestFlexStreak(days: Set<string>) {
  // Evaluate the flexible streak ending at each active day; keep the maximum.
  let best = 0;
  for (const d of days) best = Math.max(best, flexibleDailyStreak(days, addDays(d, 1)).days);
  return best;
}

async function counts(userId: string): Promise<Counts> {
  const sets = await activeDaySets(userId);
  const [workouts, recipes, foodEntries, activities] = await Promise.all([
    db.workoutSession.count({ where: { userId, status: "completed" } }),
    db.recipe.count({ where: { userId } }),
    db.foodLogEntry.count({ where: { userId } }),
    db.activity.count({ where: { userId } }),
  ]);
  const prCount = await countPersonalRecords(userId);
  return {
    workouts,
    recipes,
    mealDays: sets.mealDays.size,
    foodEntries,
    activities,
    hydrationDaysMet: sets.hydrationMet.size,
    longestLoggingStreak: longestFlexStreak(sets.anyDays),
    prCount,
    activeDays: sets.anyDays.size,
  };
}

/** A PR = a completed session where an exercise's top weight beat every earlier session's top weight. */
async function countPersonalRecords(userId: string) {
  const sets = await db.workoutSet.findMany({
    where: { completed: true, weightKg: { gt: 0 }, session: { userId, status: "completed" } },
    select: { exerciseId: true, weightKg: true, session: { select: { startedAt: true, id: true } } },
    orderBy: { session: { startedAt: "asc" } },
  });
  const best = new Map<string, number>();
  let prs = 0;
  // Group by session per exercise.
  const tops = new Map<string, { exerciseId: string; top: number; at: number }>();
  for (const s of sets) {
    const k = `${s.session.id}:${s.exerciseId}`;
    const cur = tops.get(k);
    if (!cur || s.weightKg! > cur.top) tops.set(k, { exerciseId: s.exerciseId, top: s.weightKg!, at: s.session.startedAt.getTime() });
  }
  for (const t of [...tops.values()].sort((a, b) => a.at - b.at)) {
    const prev = best.get(t.exerciseId);
    if (prev !== undefined && t.top > prev) prs++;
    if (prev === undefined || t.top > prev) best.set(t.exerciseId, t.top);
  }
  return prs;
}

/** Award any newly-earned achievements. Returns the newly awarded ones. Respects the gamification toggle. */
export async function evaluateAchievements(userId: string) {
  const settings = await db.settings.findUnique({ where: { userId }, select: { gamification: true } });
  if (settings && !settings.gamification) return [];
  const c = await counts(userId);
  const have = new Set((await db.achievement.findMany({ where: { userId }, select: { key: true } })).map((a) => a.key));
  const fresh = ACHIEVEMENTS.filter((a) => !have.has(a.key) && a.earned(c));
  for (const a of fresh) {
    await db.achievement.upsert({ where: { userId_key: { userId, key: a.key } }, create: { userId, key: a.key }, update: {} });
  }
  return fresh.map(({ key, title, description, icon }) => ({ key, title, description, icon }));
}

export async function gamificationSummary(userId: string, today: string) {
  const [sets, earned, profile, c] = await Promise.all([
    activeDaySets(userId),
    db.achievement.findMany({ where: { userId }, orderBy: { earnedAt: "desc" } }),
    db.profile.findUnique({ where: { userId }, select: { workoutsPerWeek: true } }),
    counts(userId),
  ]);
  const xp =
    c.activeDays * 10 + c.workouts * 25 + c.activities * 15 + c.recipes * 20 + c.hydrationDaysMet * 5 + earned.length * 50;
  const streaks = {
    logging: flexibleDailyStreak(sets.anyDays, today),
    meals: flexibleDailyStreak(sets.mealDays, today),
    hydration: flexibleDailyStreak(sets.hydrationMet, today),
    activity: flexibleDailyStreak(sets.movementDays, today),
    workoutWeeks: weeklyStreak(sets.workoutDays, today, Math.max(1, Math.min(profile?.workoutsPerWeek ?? 1, 7))),
  };
  return {
    level: levelFromXp(xp),
    streaks,
    achievements: ACHIEVEMENTS.map((a) => {
      const e = earned.find((x) => x.key === a.key);
      return { key: a.key, title: a.title, description: a.description, icon: a.icon, earnedAt: e?.earnedAt ?? null };
    }),
  };
}

// ───────── Challenges (optional, sustainable habits only) ─────────

export const CHALLENGES = [
  { key: "hydration_7", title: "7-day hydration", description: "Reach your daily water target on 7 days within 10 days.", windowDays: 10, required: 7, metric: "hydration_days" },
  { key: "workouts_10", title: "10-workout challenge", description: "Complete 10 workouts within 30 days. Rest days count too — recovery matters.", windowDays: 30, required: 10, metric: "workouts" },
  { key: "walking_25", title: "Walking challenge", description: "Walk or hike 25 km in 14 days.", windowDays: 14, required: 25, metric: "walk_km" },
  { key: "consistency_21", title: "Consistency challenge", description: "Log anything on 21 of 28 days.", windowDays: 28, required: 21, metric: "active_days" },
  { key: "recipes_3", title: "Recipe challenge", description: "Create 3 new home recipes in 14 days.", windowDays: 14, required: 3, metric: "recipes" },
  { key: "sleep_5of7", title: "Sleep consistency", description: "Reach your sleep target on 5 of 7 nights.", windowDays: 7, required: 5, metric: "sleep_nights" },
] as const;

async function challengeProgress(userId: string, metric: string, start: string, end: string) {
  const profile = await db.profile.findUnique({ where: { userId } });
  switch (metric) {
    case "hydration_days": {
      const rows = await db.waterEntry.groupBy({ by: ["date"], where: { userId, date: { gte: start, lte: end } }, _sum: { amountMl: true } });
      return rows.filter((r) => (r._sum.amountMl ?? 0) >= (profile?.waterTargetMl ?? 2000)).length;
    }
    case "workouts":
      return db.workoutSession.count({ where: { userId, status: "completed", date: { gte: start, lte: end } } });
    case "walk_km": {
      const r = await db.activity.aggregate({ where: { userId, type: { in: ["walking", "hiking"] }, date: { gte: start, lte: end } }, _sum: { distanceM: true } });
      return Math.round(((r._sum.distanceM ?? 0) / 1000) * 10) / 10;
    }
    case "active_days": {
      const sets = await activeDaySets(userId);
      return [...sets.anyDays].filter((d) => d >= start && d <= end).length;
    }
    case "recipes":
      return db.recipe.count({ where: { userId, createdAt: { gte: new Date(`${start}T00:00:00Z`) } } });
    case "sleep_nights": {
      const rows = await db.sleepEntry.findMany({ where: { userId, date: { gte: start, lte: end } } });
      const target = profile?.sleepTargetMin ?? 480;
      return new Set(rows.filter((r) => r.durationMin >= target - 15).map((r) => r.date)).size;
    }
  }
  return 0;
}

export async function listChallenges(userId: string, today: string) {
  const joined = await db.userChallenge.findMany({ where: { userId, status: { not: "left" } }, orderBy: { startDate: "desc" } });
  const out = [];
  for (const def of CHALLENGES) {
    // Prefer the active attempt; otherwise show the most recent one (completed history is kept).
    const uc = joined.find((j) => j.challengeKey === def.key && j.status === "active") ?? joined.find((j) => j.challengeKey === def.key);
    if (!uc) {
      out.push({ ...def, joined: false as const });
      continue;
    }
    const end = addDays(uc.startDate, def.windowDays - 1);
    const progress = await challengeProgress(userId, def.metric, uc.startDate, end < today ? end : today);
    let status = uc.status;
    if (status === "active" && progress >= def.required) {
      await db.userChallenge.update({ where: { id: uc.id }, data: { status: "completed", completedAt: new Date() } });
      status = "completed";
    }
    const daysLeft = Math.max(0, diffDays(today, end) + 1);
    out.push({ ...def, joined: true as const, id: uc.id, startDate: uc.startDate, endDate: end, progress, status, daysLeft, ended: today > end && status !== "completed" });
  }
  return out;
}

export async function joinChallenge(userId: string, key: string, today: string) {
  if (!CHALLENGES.some((c) => c.key === key)) throw notFound("challenge");
  const existing = await db.userChallenge.findFirst({ where: { userId, challengeKey: key, status: "active" } });
  if (existing) throw badRequest("You're already doing this challenge.");
  return db.userChallenge.create({ data: { userId, challengeKey: key, startDate: today } });
}

export async function leaveChallenge(userId: string, id: string) {
  const { count } = await db.userChallenge.updateMany({ where: { id, userId }, data: { status: "left" } });
  if (!count) throw notFound("challenge");
}
