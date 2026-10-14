import "server-only";
import { z } from "zod";
import { db } from "../db";
import { notFound, badRequest } from "../errors";
import { decryptOptional, encryptOptional } from "../crypto";
import { dateRange, addDays } from "@/lib/dates";
import { zClientId, zDate } from "../http";
import { recalcTargets } from "./profile";

// ───────── Hydration ─────────

export const waterSchema = z.object({
  date: zDate,
  amountMl: z.number().int().min(10, "Enter at least 10 ml").max(3000, "That's more than we can log at once"),
  drink: z.string().trim().max(40).default("water"),
  clientId: zClientId,
});

export async function addWater(userId: string, input: z.infer<typeof waterSchema>) {
  if (input.clientId) {
    const existing = await db.waterEntry.findUnique({ where: { userId_clientId: { userId, clientId: input.clientId } } });
    if (existing) return existing;
  }
  return db.waterEntry.create({ data: { userId, ...input, clientId: input.clientId ?? null } });
}

export async function updateWater(userId: string, id: string, amountMl: number) {
  const { count } = await db.waterEntry.updateMany({ where: { id, userId }, data: { amountMl } });
  if (!count) throw notFound("water entry");
}

export async function deleteWater(userId: string, id: string) {
  const { count } = await db.waterEntry.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("water entry");
}

export async function waterDay(userId: string, date: string) {
  const [entries, profile] = await Promise.all([
    db.waterEntry.findMany({ where: { userId, date }, orderBy: { loggedAt: "asc" } }),
    db.profile.findUnique({ where: { userId }, select: { waterTargetMl: true } }),
  ]);
  const totalMl = entries.reduce((s, e) => s + e.amountMl, 0);
  return { date, entries, totalMl, targetMl: profile?.waterTargetMl ?? 2000 };
}

export async function waterRange(userId: string, start: string, end: string) {
  const rows = await db.waterEntry.groupBy({ by: ["date"], where: { userId, date: { gte: start, lte: end } }, _sum: { amountMl: true } });
  const map = new Map(rows.map((r) => [r.date, r._sum.amountMl ?? 0]));
  return dateRange(start, end).map((date) => ({ date, ml: map.has(date) ? map.get(date)! : null }));
}

// ───────── Steps & daily metrics ─────────

export const stepsSchema = z.object({ date: zDate, steps: z.number().int().min(0).max(200000) });

export async function setManualSteps(userId: string, date: string, steps: number) {
  return db.dailyMetric.upsert({
    where: { userId_date_metric_source: { userId, date, metric: "steps", source: "manual" } },
    create: { userId, date, metric: "steps", source: "manual", value: steps },
    update: { value: steps },
  });
}

/** Steps per day. If several sources exist for a day, the highest is used (sources overlap rather than add up). */
export async function stepsRange(userId: string, start: string, end: string) {
  const rows = await db.dailyMetric.findMany({ where: { userId, metric: "steps", date: { gte: start, lte: end } } });
  const best = new Map<string, { value: number; source: string }>();
  for (const r of rows) if (!best.has(r.date) || best.get(r.date)!.value < r.value) best.set(r.date, { value: r.value, source: r.source });
  return dateRange(start, end).map((date) => ({ date, steps: best.get(date)?.value ?? null, source: best.get(date)?.source ?? null }));
}

// ───────── Sleep ─────────

export const sleepSchema = z.object({
  date: zDate, // wake-up date
  bedtime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  wakeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quality: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/** Bedtime/wake are local clock times; bedtime after wake time means it was the previous evening. */
export function sleepWindow(date: string, bedtime: string, wakeTime: string) {
  const [bh, bm] = bedtime.split(":").map(Number);
  const [wh, wm] = wakeTime.split(":").map(Number);
  const bedMin = bh * 60 + bm;
  const wakeMin = wh * 60 + wm;
  const crossesMidnight = bedMin >= wakeMin;
  const bedDate = crossesMidnight ? addDays(date, -1) : date;
  const durationMin = crossesMidnight ? 1440 - bedMin + wakeMin : wakeMin - bedMin;
  return {
    bedtime: new Date(`${bedDate}T${bedtime}:00Z`),
    wakeTime: new Date(`${date}T${wakeTime}:00Z`),
    durationMin,
  };
}

export async function upsertSleep(userId: string, input: z.infer<typeof sleepSchema>) {
  const w = sleepWindow(input.date, input.bedtime, input.wakeTime);
  if (w.durationMin < 30 || w.durationMin > 20 * 60) throw badRequest("That sleep duration doesn't look right. Please check the times.");
  const data = { bedtime: w.bedtime, wakeTime: w.wakeTime, durationMin: w.durationMin, quality: input.quality ?? null, notesEnc: encryptOptional(input.notes) };
  return db.sleepEntry.upsert({
    where: { userId_date_source: { userId, date: input.date, source: "manual" } },
    create: { userId, date: input.date, source: "manual", ...data },
    update: data,
  });
}

export async function deleteSleep(userId: string, id: string) {
  const { count } = await db.sleepEntry.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("sleep entry");
}

export async function sleepRange(userId: string, start: string, end: string) {
  const rows = await db.sleepEntry.findMany({ where: { userId, date: { gte: start, lte: end } }, orderBy: { date: "asc" } });
  // Prefer a manual entry over an imported one for the same night (the user's own record wins).
  const byDate = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!byDate.has(r.date) || r.source === "manual") byDate.set(r.date, r);
  return dateRange(start, end).map((date) => {
    const r = byDate.get(date);
    if (!r) return { date, logged: false as const };
    const toHHMM = (d: Date) => d.toISOString().slice(11, 16);
    return {
      date,
      logged: true as const,
      id: r.id,
      durationMin: r.durationMin,
      bedtime: toHHMM(r.bedtime),
      wakeTime: toHHMM(r.wakeTime),
      quality: r.quality,
      source: r.source,
      stages: r.stages,
      notes: decryptOptional(r.notesEnc),
    };
  });
}

/** Consistency: standard deviation of bedtime (minutes) across logged nights. Lower = more consistent. */
export function bedtimeConsistency(bedtimes: string[]) {
  if (bedtimes.length < 3) return null;
  // Shift so times after noon are "evening" (negative) to avoid the midnight wrap.
  const mins = bedtimes.map((t) => {
    const [h, m] = t.split(":").map(Number);
    const v = h * 60 + m;
    return v >= 720 ? v - 1440 : v;
  });
  const mean = mins.reduce((a, b) => a + b, 0) / mins.length;
  const sd = Math.sqrt(mins.reduce((s, v) => s + (v - mean) ** 2, 0) / mins.length);
  return Math.round(sd);
}

// ───────── Wellbeing (all optional) ─────────

const scale = z.number().int().min(1).max(5).nullable().optional();
export const wellbeingSchema = z.object({
  date: zDate,
  mood: scale,
  energy: scale,
  stress: scale,
  recovery: scale,
  restDay: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function upsertWellbeing(userId: string, input: z.infer<typeof wellbeingSchema>) {
  const { date, notes, ...rest } = input;
  const data = { ...rest, ...(notes !== undefined ? { notesEnc: encryptOptional(notes) } : {}) };
  return db.wellbeingEntry.upsert({ where: { userId_date: { userId, date } }, create: { userId, date, ...data }, update: data });
}

export async function deleteWellbeing(userId: string, date: string) {
  await db.wellbeingEntry.deleteMany({ where: { userId, date } });
}

export async function wellbeingRange(userId: string, start: string, end: string) {
  const rows = await db.wellbeingEntry.findMany({ where: { userId, date: { gte: start, lte: end } } });
  const map = new Map(rows.map((r) => [r.date, r]));
  return dateRange(start, end).map((date) => {
    const r = map.get(date);
    return r
      ? { date, logged: true as const, mood: r.mood, energy: r.energy, stress: r.stress, recovery: r.recovery, restDay: r.restDay, notes: decryptOptional(r.notesEnc) }
      : { date, logged: false as const };
  });
}

// ───────── Body measurements (optional) ─────────

export const measurementSchema = z.object({ date: zDate, weightKg: z.number().min(20).max(400).nullable().optional(), waistCm: z.number().min(30).max(300).nullable().optional() });

export async function upsertMeasurement(userId: string, input: z.infer<typeof measurementSchema>) {
  const { date, ...data } = input;
  const row = await db.bodyMeasurement.upsert({
    where: { userId_date_source: { userId, date, source: "manual" } },
    create: { userId, date, source: "manual", ...data },
    update: data,
  });
  // Keep the profile weight current so estimates stay up to date.
  if (input.weightKg) {
    const latest = await db.bodyMeasurement.findFirst({ where: { userId, weightKg: { not: null } }, orderBy: { date: "desc" } });
    if (latest?.date === date) {
      await db.profile.update({ where: { userId }, data: { weightKg: input.weightKg } });
      await recalcTargets(userId);
    }
  }
  return row;
}

export async function measurementRange(userId: string, start: string, end: string) {
  return db.bodyMeasurement.findMany({ where: { userId, date: { gte: start, lte: end } }, orderBy: { date: "asc" } });
}
