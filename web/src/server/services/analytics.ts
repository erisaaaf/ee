import "server-only";
import { db } from "../db";
import { addDays, dateRange, weekday, weekStart } from "@/lib/dates";
import { todayIn } from "@/lib/dates";
import { MACRO_KEYS, sumNutrients } from "@/lib/nutrition";
import { asNumbers, asStrings } from "./profile";
import { dayDiary, nutritionRange } from "./diary";
import { sleepRange, stepsRange, waterRange, wellbeingRange, bedtimeConsistency } from "./wellness";
import { listSessions } from "./fitness";
import { listActivities } from "./activity";
import { listGoals, goalCompletionSeries } from "./goals";

// Analytics engine — keeps three layers separate (scope §66):
//   raw data (records)  →  calculated metrics (this file)  →  AI interpretation (src/server/ai/*)

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (v: number | null, dp = 0) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

export async function localNow(userId: string) {
  const p = await db.profile.findUnique({ where: { userId }, select: { timezone: true } });
  const tz = p?.timezone ?? "UTC";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date()));
  return { today: todayIn(tz), hour: Number.isFinite(hour) ? hour % 24 : 12, tz };
}

/** General recovery overview (an ESTIMATE from sleep, recent load, rest and self-reported energy — not a medical assessment). */
export async function recoveryOverview(userId: string, today: string) {
  const [sleep, wb, sessions, acts, profile] = await Promise.all([
    sleepRange(userId, addDays(today, -2), today),
    wellbeingRange(userId, addDays(today, -1), today),
    db.workoutSession.findMany({ where: { userId, status: "completed", date: { gte: addDays(today, -2), lte: today } }, select: { effort: true, durationMin: true } }),
    db.activity.findMany({ where: { userId, date: { gte: addDays(today, -2), lte: today } }, select: { durationMin: true, intensity: true } }),
    db.profile.findUnique({ where: { userId }, select: { sleepTargetMin: true } }),
  ]);
  const factors: { label: string; effect: "positive" | "neutral" | "negative"; detail: string }[] = [];
  let score = 0;
  let inputs = 0;
  const lastNight = sleep[sleep.length - 1];
  const target = profile?.sleepTargetMin ?? 480;
  if (lastNight.logged) {
    inputs++;
    const ratio = lastNight.durationMin / target;
    const effect = ratio >= 0.95 ? "positive" : ratio >= 0.8 ? "neutral" : "negative";
    score += effect === "positive" ? 1 : effect === "negative" ? -1 : 0;
    factors.push({ label: "Sleep", effect, detail: `${Math.floor(lastNight.durationMin / 60)}h ${lastNight.durationMin % 60}m last night` });
  }
  const loadMin =
    sessions.reduce((s, x) => s + (x.durationMin ?? 0) * ((x.effort ?? 6) / 6), 0) +
    acts.reduce((s, a) => s + a.durationMin * (a.intensity === "vigorous" ? 1.3 : a.intensity === "light" ? 0.6 : 1), 0);
  if (sessions.length || acts.length) {
    inputs++;
    const effect = loadMin > 200 ? "negative" : loadMin > 90 ? "neutral" : "positive";
    score += effect === "positive" ? 1 : effect === "negative" ? -1 : 0;
    factors.push({ label: "Recent training load", effect, detail: `About ${Math.round(loadMin)} effort-weighted minutes in the last 3 days` });
  }
  const todayWb = wb.find((w) => w.date === today && w.logged) ?? wb.find((w) => w.logged);
  if (todayWb && todayWb.logged && todayWb.energy != null) {
    inputs++;
    const effect = todayWb.energy >= 4 ? "positive" : todayWb.energy <= 2 ? "negative" : "neutral";
    score += effect === "positive" ? 1 : effect === "negative" ? -1 : 0;
    factors.push({ label: "Your energy", effect, detail: `You rated your energy ${todayWb.energy}/5` });
  }
  if (todayWb && todayWb.logged && todayWb.restDay) factors.push({ label: "Rest day", effect: "positive", detail: "You marked today as a rest day" });
  if (!inputs) return { status: "unknown" as const, factors, note: "Log sleep, workouts or a quick energy check-in to see a recovery overview." };
  const status = score >= 1 ? ("good" as const) : score <= -1 ? ("take_it_easy" as const) : ("moderate" as const);
  return {
    status,
    factors,
    note: "A general estimate from the data you've logged — not a medical assessment. Listen to your body.",
  };
}

export async function scheduledWorkoutsFor(userId: string, date: string) {
  const ts = await db.workoutTemplate.findMany({ where: { userId, archived: false }, select: { id: true, name: true, scheduledDays: true, estDurationMin: true, location: true } });
  const dow = weekday(date);
  return ts.filter((t) => asNumbers(t.scheduledDays).includes(dow)).map(({ scheduledDays: _s, ...t }) => t);
}

type Rec = { key: string; title: string; body: string; action?: { label: string; href: string } };

/** Contextual, dismissible, rule-based recommendations (not AI). */
async function recommendations(userId: string, ctx: { today: string; hour: number; waterMl: number; waterTarget: number; mealsLogged: Record<string, number>; hasEquipment: boolean; scheduled: { id: string; name: string }[]; workedOutToday: boolean; sleptMin: number | null; sleepTarget: number | null; proteinToday: number }) {
  const out: Rec[] = [];
  const prevWater = await waterRange(userId, addDays(ctx.today, -7), addDays(ctx.today, -1));
  const usualWater = avg(prevWater.map((d) => d.ml).filter((v): v is number => v != null));
  if (ctx.hour >= 14 && usualWater && ctx.waterMl < usualWater * 0.5) {
    out.push({ key: "hydration_low", title: "Hydration", body: "You're below your usual hydration level today. A glass of water now could help.", action: { label: "Log water", href: "/hydration" } });
  } else if (ctx.hour >= 17 && ctx.waterMl < ctx.waterTarget * 0.5) {
    out.push({ key: "hydration_target", title: "Hydration", body: `You've had ${ctx.waterMl} ml so far today. Your target is ${ctx.waterTarget} ml.`, action: { label: "Log water", href: "/hydration" } });
  }
  if (ctx.scheduled.length && !ctx.workedOutToday && !ctx.hasEquipment) {
    out.push({ key: "bodyweight_version", title: "No equipment?", body: `Here's a bodyweight version of today's workout (${ctx.scheduled[0].name}).`, action: { label: "Generate bodyweight version", href: "/workout/generate?location=home&equipment=none" } });
  }
  const recent = await db.foodLogEntry.count({ where: { userId, date: { gte: addDays(ctx.today, -14), lt: ctx.today } } });
  if (recent > 0) {
    if (ctx.hour >= 11 && !ctx.mealsLogged.breakfast && ctx.hour < 15) out.push({ key: "missing_breakfast", title: "Breakfast", body: "You can log one of your recent meals in a tap.", action: { label: "Log a meal", href: "/nutrition/add?meal=breakfast" } });
    else if (ctx.hour >= 15 && !ctx.mealsLogged.lunch) out.push({ key: "missing_lunch", title: "Lunch", body: "Haven't logged lunch? You can log one of your recent meals.", action: { label: "Log lunch", href: "/nutrition/add?meal=lunch" } });
  }
  if (ctx.sleptMin != null && ctx.sleepTarget && ctx.sleptMin < ctx.sleepTarget - 90) {
    out.push({ key: "short_sleep", title: "Short night", body: "You slept less than usual. A lighter session or extra rest today is a reasonable choice.", action: { label: "Lighter workout", href: "/workout/generate?goal=mobility&focus=mobility&minutes=20" } });
  }
  // Protein lower than usual (only if there's history to compare with, and it's evening).
  if (ctx.hour >= 19) {
    const hist = await nutritionRange(userId, addDays(ctx.today, -14), addDays(ctx.today, -1));
    const usualProtein = avg(hist.filter((d) => d.logged).map((d) => (d.logged ? d.proteinG : 0)));
    if (usualProtein && ctx.proteinToday > 0 && ctx.proteinToday < usualProtein * 0.6) {
      out.push({ key: "protein_low", title: "Protein", body: `Your protein today (${Math.round(ctx.proteinToday)} g) is lower than your usual (~${Math.round(usualProtein)} g).`, action: { label: "Ask the coach for ideas", href: "/coach?q=High-protein+dinner+ideas" } });
    }
  }
  const dismissed = new Set((await db.dismissal.findMany({ where: { userId, key: { endsWith: `:${ctx.today}` } } })).map((d) => d.key.split(":")[0]));
  return out.filter((r) => !dismissed.has(r.key));
}

export async function dismissRecommendation(userId: string, key: string, today: string) {
  await db.dismissal.upsert({ where: { userId_key: { userId, key: `${key}:${today}` } }, create: { userId, key: `${key}:${today}` }, update: {} });
}

export async function dashboard(userId: string) {
  const { today, hour } = await localNow(userId);
  const [user, profile, prefs, settings] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    db.profile.findUnique({ where: { userId } }),
    db.preferences.findUnique({ where: { userId } }),
    db.settings.findUnique({ where: { userId } }),
  ]);
  const [diary, water, steps, sleep, wb, sessionsToday, actsToday, scheduled, goals, recovery] = await Promise.all([
    dayDiary(userId, today),
    waterRange(userId, today, today),
    stepsRange(userId, today, today),
    sleepRange(userId, today, today),
    wellbeingRange(userId, today, today),
    listSessions(userId, { start: today, end: today }),
    listActivities(userId, { start: today, end: today }),
    scheduledWorkoutsFor(userId, today),
    listGoals(userId, today),
    recoveryOverview(userId, today),
  ]);
  const waterMl = water[0].ml ?? 0;
  const mealsLogged = Object.fromEntries(Object.entries(diary.meals).map(([k, v]) => [k, v.entries.length]));
  const completedToday = sessionsToday.filter((s) => s.status === "completed");
  const recs = await recommendations(userId, {
    today,
    hour,
    waterMl,
    waterTarget: profile?.waterTargetMl ?? 2000,
    mealsLogged,
    hasEquipment: asStrings(prefs?.equipment).length > 0 || !!prefs?.gymAccess,
    scheduled,
    workedOutToday: completedToday.length > 0,
    sleptMin: sleep[0].logged ? sleep[0].durationMin : null,
    sleepTarget: profile?.sleepTargetMin ?? null,
    proteinToday: diary.totals.values.proteinG,
  });
  const pct = (cur: number, target: number | null | undefined) => (target ? Math.min(999, Math.round((cur / target) * 100)) : null);
  const activityMin = actsToday.reduce((s, a) => s + a.durationMin, 0) + completedToday.reduce((s, x) => s + (x.durationMin ?? 0), 0);
  const dailyGoals = goals.filter((g) => g.status === "active");
  return {
    today,
    hour,
    name: user?.name ?? null,
    widgets: asStrings(settings?.dashboardWidgets),
    trackingCategories: asStrings(settings?.trackingCategories),
    gamification: settings?.gamification ?? true,
    targetsSource: profile?.targetsSource ?? "calculated",
    nutrition: {
      kcal: { current: diary.totals.values.kcal, target: profile?.calorieTarget ?? null, percent: pct(diary.totals.values.kcal, profile?.calorieTarget), missing: diary.totals.missing.kcal },
      proteinG: { current: diary.totals.values.proteinG, target: profile?.proteinTargetG ?? null, percent: pct(diary.totals.values.proteinG, profile?.proteinTargetG) },
      carbsG: { current: diary.totals.values.carbsG, target: profile?.carbTargetG ?? null, percent: pct(diary.totals.values.carbsG, profile?.carbTargetG) },
      fatG: { current: diary.totals.values.fatG, target: profile?.fatTargetG ?? null, percent: pct(diary.totals.values.fatG, profile?.fatTargetG) },
      entries: diary.entryCount,
      estimates: diary.estimateCount,
      mealsLogged,
    },
    water: { current: waterMl, target: profile?.waterTargetMl ?? 2000, percent: pct(waterMl, profile?.waterTargetMl ?? 2000) },
    steps: { current: steps[0].steps, source: steps[0].source, target: profile?.stepTarget ?? null, percent: steps[0].steps != null ? pct(steps[0].steps, profile?.stepTarget) : null },
    workout: { completed: completedToday, inProgress: sessionsToday.filter((s) => s.status === "in_progress"), scheduled },
    activity: { minutes: Math.round(activityMin), sessions: actsToday.map((a) => ({ id: a.id, type: a.type, customName: a.customName, durationMin: a.durationMin, distanceM: a.distanceM })) },
    sleep: sleep[0].logged ? { durationMin: sleep[0].durationMin, quality: sleep[0].quality, target: profile?.sleepTargetMin ?? null } : null,
    wellbeing: wb[0].logged ? { mood: wb[0].mood, energy: wb[0].energy, stress: wb[0].stress, recovery: wb[0].recovery, restDay: wb[0].restDay } : null,
    recovery,
    goals: { total: dailyGoals.length, met: dailyGoals.filter((g) => g.met).length, items: dailyGoals.slice(0, 4) },
    recommendations: recs,
  };
}

// ───────── Progress series ─────────

export async function progressSeries(userId: string, start: string, end: string) {
  const [nutrition, water, steps, sleep, wb, sessions, acts, goals] = await Promise.all([
    nutritionRange(userId, start, end),
    waterRange(userId, start, end),
    stepsRange(userId, start, end),
    sleepRange(userId, start, end),
    wellbeingRange(userId, start, end),
    db.workoutSession.findMany({ where: { userId, status: "completed", date: { gte: start, lte: end } }, include: { sets: { where: { completed: true }, select: { weightKg: true, reps: true } } } }),
    db.activity.findMany({ where: { userId, date: { gte: start, lte: end } }, select: { date: true, durationMin: true, distanceM: true, type: true } }),
    goalCompletionSeries(userId, start, end),
  ]);
  const days = dateRange(start, end).map((date, i) => {
    const n = nutrition[i];
    const sl = sleep[i];
    const w = wb[i];
    const daySessions = sessions.filter((s) => s.date === date);
    const dayActs = acts.filter((a) => a.date === date);
    const g = goals[i];
    return {
      date,
      kcal: n.logged ? n.kcal : null,
      proteinG: n.logged ? n.proteinG : null,
      carbsG: n.logged ? n.carbsG : null,
      fatG: n.logged ? n.fatG : null,
      fiberG: n.logged ? n.fiberG : null,
      waterMl: water[i].ml,
      steps: steps[i].steps,
      sleepMin: sl.logged ? sl.durationMin : null,
      sleepQuality: sl.logged ? sl.quality : null,
      mood: w.logged ? w.mood : null,
      energy: w.logged ? w.energy : null,
      stress: w.logged ? w.stress : null,
      workouts: daySessions.length,
      volumeKg: Math.round(daySessions.reduce((s, x) => s + x.sets.reduce((a, b) => a + (b.weightKg ?? 0) * (b.reps ?? 0), 0), 0)),
      activityMin: Math.round(dayActs.reduce((s, a) => s + a.durationMin, 0) + daySessions.reduce((s, x) => s + (x.durationMin ?? 0), 0)),
      distanceKm: round(dayActs.reduce((s, a) => s + (a.distanceM ?? 0), 0) / 1000, 1),
      goalsMet: g.tracked ? g.met : null,
      goalsTracked: g.tracked,
    };
  });
  const loggedVals = <K extends keyof (typeof days)[number]>(k: K) => days.map((d) => d[k]).filter((v): v is NonNullable<typeof v> => v != null) as number[];
  const bedtimes = sleep.filter((s) => s.logged).map((s) => (s.logged ? s.bedtime : ""));
  return {
    start,
    end,
    days,
    summary: {
      daysLogged: { nutrition: loggedVals("kcal").length, water: loggedVals("waterMl").length, sleep: loggedVals("sleepMin").length, steps: loggedVals("steps").length },
      avgKcal: round(avg(loggedVals("kcal"))),
      avgProteinG: round(avg(loggedVals("proteinG"))),
      avgCarbsG: round(avg(loggedVals("carbsG"))),
      avgFatG: round(avg(loggedVals("fatG"))),
      avgFiberG: round(avg(loggedVals("fiberG"))),
      avgWaterMl: round(avg(loggedVals("waterMl"))),
      avgSteps: round(avg(loggedVals("steps"))),
      avgSleepMin: round(avg(loggedVals("sleepMin"))),
      avgMood: round(avg(loggedVals("mood")), 1),
      avgEnergy: round(avg(loggedVals("energy")), 1),
      workouts: sessions.length,
      totalVolumeKg: days.reduce((s, d) => s + d.volumeKg, 0),
      activityMin: days.reduce((s, d) => s + d.activityMin, 0),
      distanceKm: round(days.reduce((s, d) => s + (d.distanceKm ?? 0), 0), 1),
      // Share of days in range with at least one food entry ("meal consistency").
      nutritionConsistency: round((loggedVals("kcal").length / days.length) * 100),
      bedtimeVariabilityMin: bedtimeConsistency(bedtimes),
      sportBreakdown: Object.entries(acts.reduce<Record<string, number>>((m, a) => ((m[a.type] = (m[a.type] ?? 0) + a.durationMin), m), {})).map(([type, minutes]) => ({ type, minutes: Math.round(minutes) })),
    },
  };
}

/** Structured week summary (calculated metrics only) — the AI weekly review interprets this, never raw tables. */
export async function weekSummary(userId: string, weekStartDate: string) {
  const end = addDays(weekStartDate, 6);
  const prevStart = addDays(weekStartDate, -7);
  const [cur, prev, profile, prefs] = await Promise.all([
    progressSeries(userId, weekStartDate, end),
    progressSeries(userId, prevStart, addDays(weekStartDate, -1)),
    db.profile.findUnique({ where: { userId } }),
    db.preferences.findUnique({ where: { userId } }),
  ]);
  return {
    week: { start: weekStartDate, end },
    goals: asStrings(prefs?.goals),
    targets: { kcal: profile?.calorieTarget, proteinG: profile?.proteinTargetG, waterMl: profile?.waterTargetMl, steps: profile?.stepTarget, sleepMin: profile?.sleepTargetMin, workoutsPerWeek: profile?.workoutsPerWeek },
    thisWeek: cur.summary,
    previousWeek: prev.summary,
  };
}

export const currentWeekStart = (today: string) => weekStart(today);

export async function todayNutritionForAi(userId: string, date: string) {
  const d = await dayDiary(userId, date);
  return {
    date,
    totals: d.totals.values,
    itemsMissingData: d.totals.missing,
    estimateEntries: d.estimateCount,
    meals: Object.fromEntries(
      Object.entries(d.meals).map(([m, v]) => [m, { items: v.entries.map((e) => ({ name: e.name, grams: e.grams, kcal: e.totals.kcal, proteinG: e.totals.proteinG, estimate: e.isEstimate })), totals: sumNutrients(v.entries.map((e) => e.totals), MACRO_KEYS).values }]),
    ),
  };
}
