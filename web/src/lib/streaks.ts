import { addDays, weekStart } from "./dates";

/**
 * Flexible daily streak.
 *  - Today not yet done does NOT break the streak (the day isn't over).
 *  - One missed day per rolling 7 days is forgiven ("flex day") — the streak continues.
 *  - Two misses within 7 days end the streak.
 * Returns the number of ACTIVE days in the streak and how many flex days were used.
 */
export function flexibleDailyStreak(activeDays: Set<string>, today: string, maxLookback = 400) {
  let count = 0;
  let flexUsed = 0;
  let lastMiss: number | null = null;
  for (let i = 0; i < maxLookback; i++) {
    const day = addDays(today, -i);
    if (activeDays.has(day)) {
      count++;
      continue;
    }
    if (i === 0) continue; // today still in progress
    if (lastMiss !== null && lastMiss - i < 7) break; // a second miss within a week ends it
    // A miss is only forgiven if it's surrounded by activity (not at the very start of history).
    const before = addDays(day, -1);
    if (!activeDays.has(before)) break;
    lastMiss = i;
    flexUsed++;
  }
  return { days: count, flexUsed };
}

/** Consecutive weeks (Mon–Sun) meeting a weekly target. The current week counts only once it's met. */
export function weeklyStreak(datesWithActivity: string[], today: string, perWeek = 1, maxWeeks = 104) {
  const counts = new Map<string, number>();
  for (const d of datesWithActivity) {
    const w = weekStart(d);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  let streak = 0;
  const thisWeek = weekStart(today);
  for (let i = 0; i < maxWeeks; i++) {
    const w = addDays(thisWeek, -7 * i);
    const met = (counts.get(w) ?? 0) >= perWeek;
    if (met) streak++;
    else if (i === 0) continue; // current week still in progress
    else break;
  }
  return streak;
}

/** XP & level derived purely from recorded actions (nothing stored, nothing awarded without data). */
export function levelFromXp(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const currentFloor = 50 * (level - 1) ** 2;
  const nextFloor = 50 * level ** 2;
  return { level, xp, intoLevel: xp - currentFloor, levelSize: nextFloor - currentFloor };
}
