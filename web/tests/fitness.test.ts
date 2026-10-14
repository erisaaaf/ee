import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { EXERCISES } from "@/server/fitness/exercises";
import { canDo, generateWorkout, itemSeconds, substitutes, estimate1RM, type GenExercise } from "@/lib/workout-generator";
import { flexibleDailyStreak, levelFromXp, weeklyStreak } from "@/lib/streaks";
import { addSet, createTemplate, finishSession, getExercise, getSession, listExercises, startSession, updateSet, exerciseHistory, generateForUser } from "@/server/services/fitness";
import { addActivity, routeStats, updateActivity } from "@/server/services/activity";
import { sleepWindow, upsertSleep, addWater, waterDay, upsertWellbeing, wellbeingRange } from "@/server/services/wellness";
import { evaluateAchievements, gamificationSummary, joinChallenge, listChallenges } from "@/server/services/gamification";
import { createGoal, listGoals } from "@/server/services/goals";
import { dashboard, progressSeries } from "@/server/services/analytics";
import { updatePreferences } from "@/server/services/profile";
import { cid, makeUser } from "./helpers";

const lib: (GenExercise & { alternatives: string[] })[] = EXERCISES.map((e) => ({
  id: e.slug,
  slug: e.slug,
  name: e.name,
  category: e.category,
  muscleGroups: e.muscles,
  equipment: e.equipment,
  difficulty: e.difficulty,
  trackingType: e.tracking,
  alternatives: e.alternatives,
}));

describe("workout generator (pure)", () => {
  it("only uses available equipment and stays within the time budget", () => {
    for (const minutes of [15, 30, 45]) {
      const plan = generateWorkout(lib, { minutes, location: "home", equipment: [], level: "beginner", goal: "general", focus: "full", seed: minutes });
      expect(plan.items.every((i) => lib.find((e) => e.slug === i.slug)!.equipment.length === 0)).toBe(true);
      expect(plan.items.some((i) => i.block === "main")).toBe(true);
      const secs = plan.items.reduce((s, i) => s + itemSeconds(i), 0);
      expect(secs / 60).toBeLessThanOrEqual(minutes + 2);
      expect(plan.items.every((i) => i.sets <= 4)).toBe(true);
    }
  });

  it("excludes advanced moves for beginners, jumps in low-impact mode, and user-flagged areas", () => {
    const plan = generateWorkout(lib, { minutes: 60, location: "gym", equipment: ["dumbbells", "barbell", "bench", "pullup_bar", "kettlebell"], level: "beginner", goal: "strength", focus: "full", lowImpact: true, avoidAreas: ["knees"], seed: 7 });
    for (const i of plan.items) {
      const ex = lib.find((e) => e.slug === i.slug)!;
      expect(ex.difficulty).toBe("beginner");
      expect(ex.category).not.toBe("plyometric");
      expect(ex.muscleGroups).not.toContain("quads");
    }
    expect(plan.notes.join(" ")).toMatch(/physiotherapist|doctor/);
  });

  it("finds substitutes that fit the user's equipment ('No dumbbells?')", () => {
    const row = lib.find((e) => e.slug === "dumbbell-row")!;
    const subs = substitutes(row, lib, { equipment: [], level: "advanced" });
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.every((s) => s.equipment.length === 0)).toBe(true);
    expect(canDo(row, { equipment: [], level: "advanced" })).toBe(false);
  });

  it("estimates 1RM with Epley", () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 10)).toBeCloseTo(133.3, 1);
  });
});

describe("streaks (pure)", () => {
  it("forgives one missed day per week but not two", () => {
    const days = new Set(["2026-10-01", "2026-10-02", "2026-10-03", /* miss 04 */ "2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(flexibleDailyStreak(days, "2026-10-07")).toEqual({ days: 6, flexUsed: 1 });
    // Today not logged yet doesn't break the streak.
    expect(flexibleDailyStreak(days, "2026-10-08").days).toBe(6);
    const twoMisses = new Set(["2026-10-01", "2026-10-03", "2026-10-05", "2026-10-06"]);
    expect(flexibleDailyStreak(twoMisses, "2026-10-06").days).toBe(3);
  });
  it("counts workout streaks in weeks, not days", () => {
    expect(weeklyStreak(["2026-09-22", "2026-09-29", "2026-10-06"], "2026-10-11", 1)).toBe(3);
    expect(weeklyStreak(["2026-09-22", "2026-10-06"], "2026-10-11", 1)).toBe(1);
  });
  it("derives levels from XP", () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(50).level).toBe(2);
    expect(levelFromXp(199).level).toBe(2);
    expect(levelFromXp(200).level).toBe(3);
  });
});

describe("workout sessions", () => {
  it("logs a session from a plan, detects a personal record, and builds progression history", async () => {
    const { user } = await makeUser();
    const squat = await db.exercise.findUniqueOrThrow({ where: { slug: "goblet-squat" } });
    const t = await createTemplate(user.id, { name: "Legs", location: "home", source: "user", scheduledDays: [1], items: [{ exerciseId: squat.id, sets: 2, reps: 10, restSec: 60 }] });

    // Session 1: 20 kg
    let s = await startSession(user.id, { templateId: t.id, date: "2026-10-01", clientId: cid() });
    expect(s.sets).toHaveLength(2);
    await expect(finishSession(user.id, s.id, {})).rejects.toMatchObject({ status: 400 }); // nothing done yet
    for (const set of s.sets) await updateSet(user.id, s.id, set.id, { weightKg: 20, reps: 10, completed: true });
    const first = await finishSession(user.id, s.id, { durationMin: 30 });
    expect(first.newRecords).toEqual([]); // baseline, not a record

    // Session 2: pre-filled with last weight; then a heavier set → PR
    s = await startSession(user.id, { templateId: t.id, date: "2026-10-04" });
    expect(s.sets[0].weightKg).toBe(20);
    await updateSet(user.id, s.id, s.sets[0].id, { weightKg: 24, reps: 8, completed: true });
    const second = await finishSession(user.id, s.id, { durationMin: 25 });
    expect(second.newRecords[0]).toMatchObject({ kind: "heaviest weight (kg)", value: 24 });

    const hist = await exerciseHistory(user.id, squat.id);
    expect(hist.points.map((p) => p.topWeightKg)).toEqual([20, 24]);
    expect(hist.best.weightKg).toBe(24);
    expect((await getExercise(user.id, "goblet-squat")).history.sessions).toBe(2);
  });

  it("adds ad-hoc sets and protects other users' sessions", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const pushup = await db.exercise.findUniqueOrThrow({ where: { slug: "push-up" } });
    const s = await startSession(a.user.id, { date: "2026-10-05", name: "Quick" });
    const after = await addSet(a.user.id, s.id, { exerciseId: pushup.id, reps: 12, completed: true });
    expect(after.exercises[0].sets).toHaveLength(1);
    await expect(getSession(b.user.id, s.id)).rejects.toMatchObject({ status: 404 });
    await expect(addSet(b.user.id, s.id, { exerciseId: pushup.id, reps: 1 })).rejects.toMatchObject({ status: 404 });
  });

  it("filters the library by the user's equipment and generates from preferences", async () => {
    const { user } = await makeUser();
    await updatePreferences(user.id, { equipment: ["resistance_band"] });
    const doable = await listExercises(user.id, { doable: true });
    expect(doable.every((e) => e.equipment.every((q) => q === "resistance_band"))).toBe(true);
    expect(doable.some((e) => e.slug === "band-row")).toBe(true);
    const gen = await generateForUser(user.id, { minutes: 20, location: "home", goal: "general", focus: "upper", seed: 3 });
    expect(gen.items.length).toBeGreaterThan(0);
  });
});

describe("sports & GPS", () => {
  it("computes distance from GPS points server-side and ignores client distance", async () => {
    const { user } = await makeUser();
    const route: [number, number, number, number][] = Array.from({ length: 11 }, (_, i) => [41.3275 + i * 0.0005, 19.8187, Date.now() + i * 10_000, 100 + i]);
    const stats = routeStats(route);
    expect(stats.distanceM).toBeGreaterThan(500);
    expect(stats.distanceM).toBeLessThan(600);
    const a = await addActivity(user.id, { type: "running", date: "2026-10-10", durationMin: 5, source: "gps", route, distanceM: 99999 });
    expect(a.distanceM).toBe(stats.distanceM);
    // Editing can't overwrite measured GPS distance.
    const edited = await updateActivity(user.id, a.id, { distanceM: 1, notes: "felt good" });
    expect(edited.distanceM).toBe(stats.distanceM);
    expect(edited.notes).toBe("felt good");
  });

  it("rejects GPS activities without points and stores no route for manual entries", async () => {
    const { user } = await makeUser();
    await expect(addActivity(user.id, { type: "running", date: "2026-10-10", durationMin: 5, source: "gps", route: [] })).rejects.toMatchObject({ status: 400 });
    const m = await addActivity(user.id, { type: "football", date: "2026-10-10", durationMin: 60, source: "manual", route: [[1, 1, 1, null], [2, 2, 2, null]] });
    expect(m.route).toBeNull();
  });
});

describe("wellness", () => {
  it("computes sleep across midnight and rejects implausible durations", async () => {
    expect(sleepWindow("2026-10-11", "23:30", "07:00").durationMin).toBe(450);
    expect(sleepWindow("2026-10-11", "01:00", "08:30").durationMin).toBe(450);
    const { user } = await makeUser();
    await expect(upsertSleep(user.id, { date: "2026-10-11", bedtime: "07:00", wakeTime: "07:10" })).rejects.toMatchObject({ status: 400 });
  });

  it("water entries are idempotent and wellbeing fields are all optional", async () => {
    const { user } = await makeUser();
    const clientId = cid();
    await addWater(user.id, { date: "2026-10-11", amountMl: 250, drink: "water", clientId });
    await addWater(user.id, { date: "2026-10-11", amountMl: 250, drink: "water", clientId });
    expect((await waterDay(user.id, "2026-10-11")).totalMl).toBe(250);
    await upsertWellbeing(user.id, { date: "2026-10-11", energy: 4 });
    const wb = await wellbeingRange(user.id, "2026-10-11", "2026-10-11");
    expect(wb[0]).toMatchObject({ logged: true, energy: 4, mood: null });
  });
});

describe("goals, achievements & dashboard", () => {
  it("awards achievements only for recorded actions", async () => {
    const { user } = await makeUser();
    expect(await evaluateAchievements(user.id)).toEqual([]);
    await addWater(user.id, { date: "2026-10-11", amountMl: 300, drink: "water" });
    expect(await evaluateAchievements(user.id)).toEqual([]); // water alone earns nothing listed
    const pushup = await db.exercise.findUniqueOrThrow({ where: { slug: "push-up" } });
    const s = await startSession(user.id, { date: "2026-10-11" });
    await addSet(user.id, s.id, { exerciseId: pushup.id, reps: 10, completed: true });
    // An unfinished workout doesn't count.
    expect((await evaluateAchievements(user.id)).map((a) => a.key)).not.toContain("first_workout");
    await finishSession(user.id, s.id, {});
    expect((await evaluateAchievements(user.id)).map((a) => a.key)).toContain("first_workout");
    // Not awarded twice.
    expect((await evaluateAchievements(user.id)).map((a) => a.key)).not.toContain("first_workout");
    const summary = await gamificationSummary(user.id, "2026-10-11");
    expect(summary.level.xp).toBeGreaterThan(0);
  });

  it("respects the gamification off switch", async () => {
    const { user } = await makeUser();
    await db.settings.update({ where: { userId: user.id }, data: { gamification: false } });
    await addActivity(user.id, { type: "walking", date: "2026-10-11", durationMin: 30, source: "manual" });
    expect(await evaluateAchievements(user.id)).toEqual([]);
  });

  it("computes goal and challenge progress from real data", async () => {
    const { user } = await makeUser();
    await createGoal(user.id, { type: "water_daily", title: "Water", target: 2000, startDate: "2026-10-11" });
    await addWater(user.id, { date: "2026-10-11", amountMl: 500, drink: "water" });
    const goals = await listGoals(user.id, "2026-10-11");
    expect(goals[0]).toMatchObject({ current: 500, percent: 25, met: false });
    await joinChallenge(user.id, "walking_25", "2026-10-11");
    await addActivity(user.id, { type: "walking", date: "2026-10-11", durationMin: 60, distanceM: 6000, source: "manual" });
    const ch = (await listChallenges(user.id, "2026-10-11")).find((c) => c.key === "walking_25")!;
    expect(ch.joined && ch.progress).toBe(6);
  });

  it("distinguishes missing data from zero in progress series and builds a dashboard", async () => {
    const { user } = await makeUser();
    await addWater(user.id, { date: "2026-10-10", amountMl: 1000, drink: "water" });
    const series = await progressSeries(user.id, "2026-10-09", "2026-10-10");
    expect(series.days[0].waterMl).toBeNull();
    expect(series.days[1].waterMl).toBe(1000);
    expect(series.days[0].kcal).toBeNull();
    const d = await dashboard(user.id);
    expect(d.water.target).toBe(2000);
    expect(d.steps.current).toBeNull(); // no steps recorded ≠ 0 steps
    expect(Array.isArray(d.recommendations)).toBe(true);
  });
});
