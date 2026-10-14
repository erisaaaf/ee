import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { normalize } from "@/lib/text";
import { estimate1RM, generateWorkout, substitutes, type GenExercise, type GenOptions } from "@/lib/workout-generator";
import { asNumbers, asStrings } from "./profile";
import { decryptOptional } from "../crypto";
import { zClientId, zDate } from "../http";
import type { Exercise } from "@/generated/prisma/client";

// ───────── Exercise library ─────────

export function exerciseDTO(e: Exercise) {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    category: e.category,
    muscleGroups: asStrings(e.muscleGroups),
    equipment: asStrings(e.equipment),
    difficulty: e.difficulty,
    instructions: asStrings(e.instructions),
    commonMistakes: asStrings(e.commonMistakes),
    alternatives: asStrings(e.alternatives),
    homeVersion: e.homeVersion,
    gymVersion: e.gymVersion,
    trackingType: e.trackingType,
    isCustom: e.ownerId != null,
  };
}
export type ExerciseDTO = ReturnType<typeof exerciseDTO>;

async function allExercises(userId: string) {
  const rows = await db.exercise.findMany({ where: { OR: [{ ownerId: null }, { ownerId: userId }] }, orderBy: { name: "asc" } });
  return rows.map(exerciseDTO);
}

export async function userEquipment(userId: string) {
  const prefs = await db.preferences.findUnique({ where: { userId } });
  return {
    equipment: asStrings(prefs?.equipment),
    gymAccess: prefs?.gymAccess ?? false,
    limitations: decryptOptional(prefs?.limitationsEnc),
    travelMode: prefs?.travelMode ?? false,
  };
}

export const GYM_EQUIPMENT = ["dumbbells", "barbell", "kettlebell", "resistance_band", "pullup_bar", "bench", "cable_machine", "machines", "cardio_machine", "mat"];

export async function listExercises(
  userId: string,
  f: { q?: string; category?: string; muscle?: string; equipment?: string; difficulty?: string; doable?: boolean; location?: "home" | "gym" },
) {
  const list = await allExercises(userId);
  const favs = new Set((await db.favorite.findMany({ where: { userId, kind: "exercise" } })).map((x) => x.refId));
  const prefs = await userEquipment(userId);
  const available = f.location === "gym" ? GYM_EQUIPMENT : prefs.equipment;
  const nq = f.q ? normalize(f.q) : "";
  return list
    .filter((e) => !nq || normalize(`${e.name} ${e.muscleGroups.join(" ")}`).includes(nq))
    .filter((e) => !f.category || e.category === f.category)
    .filter((e) => !f.muscle || e.muscleGroups.includes(f.muscle))
    .filter((e) => !f.difficulty || e.difficulty === f.difficulty)
    .filter((e) => !f.equipment || (f.equipment === "none" ? e.equipment.length === 0 : e.equipment.includes(f.equipment)))
    .filter((e) => !f.doable || e.equipment.every((q) => available.includes(q)))
    .map((e) => ({ ...e, isFavorite: favs.has(e.id), doable: e.equipment.every((q) => available.includes(q)) }));
}

export async function getExercise(userId: string, slug: string) {
  const ex = await db.exercise.findFirst({ where: { slug, OR: [{ ownerId: null }, { ownerId: userId }] } });
  if (!ex) throw notFound("exercise");
  const dto = exerciseDTO(ex);
  const all = await allExercises(userId);
  const prefs = await userEquipment(userId);
  const opts = { equipment: prefs.equipment, level: "advanced" as const };
  const subs = substitutes(dto, all, opts, 5);
  const fav = await db.favorite.findUnique({ where: { userId_kind_refId: { userId, kind: "exercise", refId: ex.id } } });
  return {
    ...dto,
    isFavorite: !!fav,
    doableWithMyEquipment: dto.equipment.every((q) => prefs.equipment.includes(q)),
    alternativesResolved: all.filter((a) => dto.alternatives.includes(a.slug)).map((a) => ({ slug: a.slug, name: a.name, equipment: a.equipment })),
    substitutesForMyEquipment: subs.map((s) => ({ slug: s.slug, name: s.name, equipment: s.equipment })),
    history: await exerciseHistory(userId, ex.id),
  };
}

export const customExerciseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.enum(["strength", "cardio", "mobility", "core", "plyometric"]),
  muscleGroups: z.array(z.string().max(30)).max(8).default([]),
  equipment: z.array(z.string().max(30)).max(8).default([]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  instructions: z.array(z.string().max(300)).max(12).default([]),
  trackingType: z.enum(["reps", "weighted", "time", "distance"]).default("reps"),
});

export async function createCustomExercise(userId: string, input: z.infer<typeof customExerciseSchema>) {
  const ex = await db.exercise.create({
    data: { ...input, slug: `custom-${randomUUID().slice(0, 12)}`, ownerId: userId, commonMistakes: [], alternatives: [] },
  });
  return exerciseDTO(ex);
}

// ───────── Templates (workout plans) ─────────

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  location: z.enum(["home", "gym", "any"]).default("any"),
  source: z.enum(["user", "generator", "ai"]).default("user"),
  estDurationMin: z.number().int().min(1).max(300).nullable().optional(),
  scheduledDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  items: z
    .array(
      z.object({
        exerciseId: z.string(),
        sets: z.number().int().min(1).max(10),
        reps: z.number().int().min(1).max(100).nullable().optional(),
        durationSec: z.number().int().min(5).max(7200).nullable().optional(),
        restSec: z.number().int().min(0).max(600).default(60),
        weightKg: z.number().min(0).max(500).nullable().optional(),
        notes: z.string().max(300).nullable().optional(),
      }),
    )
    .min(1, "Add at least one exercise")
    .max(30),
});

async function assertExercisesVisible(userId: string, ids: string[]) {
  const n = await db.exercise.count({ where: { id: { in: ids }, OR: [{ ownerId: null }, { ownerId: userId }] } });
  if (n !== new Set(ids).size) throw badRequest("One of the exercises couldn't be found.");
}

export async function createTemplate(userId: string, input: z.infer<typeof templateSchema>) {
  await assertExercisesVisible(userId, input.items.map((i) => i.exerciseId));
  const { items, ...rest } = input;
  const t = await db.workoutTemplate.create({
    data: { userId, ...rest, items: { create: items.map((i, position) => ({ ...i, position })) } },
  });
  return getTemplate(userId, t.id);
}

export async function updateTemplate(userId: string, id: string, input: z.infer<typeof templateSchema>) {
  const existing = await db.workoutTemplate.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("workout plan");
  await assertExercisesVisible(userId, input.items.map((i) => i.exerciseId));
  const { items, ...rest } = input;
  await db.$transaction([
    db.workoutTemplateExercise.deleteMany({ where: { templateId: id } }),
    db.workoutTemplate.update({ where: { id }, data: { ...rest, items: { create: items.map((i, position) => ({ ...i, position })) } } }),
  ]);
  return getTemplate(userId, id);
}

export async function getTemplate(userId: string, id: string) {
  const t = await db.workoutTemplate.findFirst({ where: { id, userId }, include: { items: { orderBy: { position: "asc" } } } });
  if (!t) throw notFound("workout plan");
  const exs = await db.exercise.findMany({ where: { id: { in: t.items.map((i) => i.exerciseId) } } });
  const fav = await db.favorite.findUnique({ where: { userId_kind_refId: { userId, kind: "workout", refId: id } } });
  return {
    ...t,
    scheduledDays: asNumbers(t.scheduledDays),
    isFavorite: !!fav,
    items: t.items.map((i) => {
      const e = exs.find((x) => x.id === i.exerciseId);
      return { ...i, exercise: e ? exerciseDTO(e) : null };
    }),
  };
}

export async function listTemplates(userId: string) {
  const ts = await db.workoutTemplate.findMany({ where: { userId, archived: false }, include: { items: true }, orderBy: { updatedAt: "desc" } });
  const favs = new Set((await db.favorite.findMany({ where: { userId, kind: "workout" } })).map((f) => f.refId));
  return ts.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    location: t.location,
    source: t.source,
    estDurationMin: t.estDurationMin,
    scheduledDays: asNumbers(t.scheduledDays),
    exerciseCount: t.items.length,
    isFavorite: favs.has(t.id),
  }));
}

export async function deleteTemplate(userId: string, id: string) {
  const { count } = await db.workoutTemplate.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("workout plan");
  await db.favorite.deleteMany({ where: { userId, kind: "workout", refId: id } });
}

// ───────── Generator ─────────

export const generateSchema = z.object({
  minutes: z.number().int().min(10).max(120),
  location: z.enum(["home", "gym"]),
  goal: z.enum(["strength", "endurance", "general", "mobility"]),
  focus: z.enum(["full", "upper", "lower", "core", "cardio", "mobility"]),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  equipment: z.array(z.string()).optional(),
  lowImpact: z.boolean().optional(),
  avoidAreas: z.array(z.string().max(30)).max(6).optional(),
  avoidSlugs: z.array(z.string().max(60)).max(30).optional(),
  seed: z.number().int().optional(),
});

export async function generateForUser(userId: string, input: z.infer<typeof generateSchema>) {
  const [profile, prefs] = await Promise.all([db.profile.findUnique({ where: { userId } }), userEquipment(userId)]);
  const level = input.level ?? ((profile?.experience as GenOptions["level"]) || "beginner");
  const equipment = input.equipment ?? (input.location === "gym" ? GYM_EQUIPMENT : prefs.equipment);
  const all = (await allExercises(userId)) as GenExercise[];
  const plan = generateWorkout(all, { ...input, level, equipment, seed: input.seed ?? Math.floor(Math.random() * 1e9) });
  return { ...plan, level, equipment };
}

// ───────── Sessions ─────────

export const startSessionSchema = z.object({
  templateId: z.string().nullable().optional(),
  name: z.string().trim().max(100).optional(),
  date: zDate,
  clientId: zClientId,
});

export async function startSession(userId: string, input: z.infer<typeof startSessionSchema>) {
  if (input.clientId) {
    const existing = await db.workoutSession.findUnique({ where: { userId_clientId: { userId, clientId: input.clientId } } });
    if (existing) return getSession(userId, existing.id);
  }
  let name = input.name || "Workout";
  const sets: { exerciseId: string; exerciseName: string; setIndex: number; reps: number | null; weightKg: number | null; durationSec: number | null; restSec: number }[] = [];
  if (input.templateId) {
    const t = await getTemplate(userId, input.templateId);
    name = input.name || t.name;
    // Pre-fill with the template and the last weights used for each exercise (progressive overload hint).
    for (const item of t.items) {
      if (!item.exercise) continue;
      const last = await db.workoutSet.findFirst({
        where: { exerciseId: item.exerciseId, completed: true, session: { userId, status: "completed" } },
        orderBy: { session: { startedAt: "desc" } },
      });
      for (let s = 0; s < item.sets; s++) {
        sets.push({
          exerciseId: item.exerciseId,
          exerciseName: item.exercise.name,
          setIndex: s,
          reps: item.reps ?? null,
          weightKg: item.weightKg ?? last?.weightKg ?? null,
          durationSec: item.durationSec ?? null,
          restSec: item.restSec,
        });
      }
    }
  }
  const session = await db.workoutSession.create({
    data: { userId, clientId: input.clientId ?? null, templateId: input.templateId ?? null, name, date: input.date, sets: { create: sets } },
  });
  return getSession(userId, session.id);
}

export async function getSession(userId: string, id: string) {
  const s = await db.workoutSession.findFirst({ where: { id, userId }, include: { sets: { orderBy: [{ exerciseId: "asc" }, { setIndex: "asc" }] } } });
  if (!s) throw notFound("workout");
  // Preserve the exercise order as first added.
  const order: string[] = [];
  for (const set of [...s.sets].sort((a, b) => a.id.localeCompare(b.id))) if (!order.includes(set.exerciseId)) order.push(set.exerciseId);
  const exs = await db.exercise.findMany({ where: { id: { in: order } } });
  return {
    ...s,
    exercises: order.map((exerciseId) => {
      const e = exs.find((x) => x.id === exerciseId);
      return {
        exerciseId,
        exercise: e ? exerciseDTO(e) : null,
        sets: s.sets.filter((x) => x.exerciseId === exerciseId).sort((a, b) => a.setIndex - b.setIndex),
      };
    }),
    volumeKg: s.sets.filter((x) => x.completed).reduce((sum, x) => sum + (x.weightKg ?? 0) * (x.reps ?? 0), 0),
  };
}

export const setSchema = z.object({
  exerciseId: z.string(),
  reps: z.number().int().min(0).max(500).nullable().optional(),
  weightKg: z.number().min(0).max(1000).nullable().optional(),
  durationSec: z.number().int().min(0).max(36000).nullable().optional(),
  distanceM: z.number().min(0).max(1_000_000).nullable().optional(),
  restSec: z.number().int().min(0).max(1800).nullable().optional(),
  completed: z.boolean().optional(),
});

async function ownSession(userId: string, sessionId: string) {
  const s = await db.workoutSession.findFirst({ where: { id: sessionId, userId } });
  if (!s) throw notFound("workout");
  return s;
}

export async function addSet(userId: string, sessionId: string, input: z.infer<typeof setSchema>) {
  await ownSession(userId, sessionId);
  const ex = await db.exercise.findFirst({ where: { id: input.exerciseId, OR: [{ ownerId: null }, { ownerId: userId }] } });
  if (!ex) throw notFound("exercise");
  const count = await db.workoutSet.count({ where: { sessionId, exerciseId: ex.id } });
  await db.workoutSet.create({ data: { sessionId, exerciseName: ex.name, setIndex: count, ...input, exerciseId: ex.id } });
  return getSession(userId, sessionId);
}

export async function updateSet(userId: string, sessionId: string, setId: string, input: Partial<z.infer<typeof setSchema>>) {
  await ownSession(userId, sessionId);
  const { exerciseId: _ignored, ...data } = input;
  const { count } = await db.workoutSet.updateMany({ where: { id: setId, sessionId }, data });
  if (!count) throw notFound("set");
  return getSession(userId, sessionId);
}

export async function deleteSet(userId: string, sessionId: string, setId: string) {
  await ownSession(userId, sessionId);
  await db.workoutSet.deleteMany({ where: { id: setId, sessionId } });
  return getSession(userId, sessionId);
}

export const finishSchema = z.object({
  durationMin: z.number().int().min(1).max(600).optional(),
  effort: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  name: z.string().trim().max(100).optional(),
  date: zDate.optional(),
});

export async function finishSession(userId: string, id: string, input: z.infer<typeof finishSchema>) {
  const s = await ownSession(userId, id);
  const completedSets = await db.workoutSet.count({ where: { sessionId: id, completed: true } });
  if (completedSets === 0) throw badRequest("Mark at least one set as done before finishing — or discard this workout.");
  const endedAt = new Date();
  const computed = Math.max(1, Math.round((endedAt.getTime() - s.startedAt.getTime()) / 60000));
  const prsBefore = await personalRecordsFor(userId, id);
  await db.workoutSession.update({
    where: { id },
    data: { status: "completed", endedAt, durationMin: input.durationMin ?? Math.min(computed, 600), effort: input.effort, notes: input.notes, name: input.name ?? s.name, date: input.date ?? s.date },
  });
  return { session: await getSession(userId, id), newRecords: prsBefore };
}

/** Edit a completed workout in history (name/date/duration/notes). */
export async function editSession(userId: string, id: string, input: z.infer<typeof finishSchema>) {
  await ownSession(userId, id);
  await db.workoutSession.update({ where: { id }, data: input });
  return getSession(userId, id);
}

export async function deleteSession(userId: string, id: string) {
  const { count } = await db.workoutSession.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("workout");
}

export async function listSessions(userId: string, opts: { start?: string; end?: string; limit?: number } = {}) {
  const sessions = await db.workoutSession.findMany({
    where: { userId, ...(opts.start || opts.end ? { date: { gte: opts.start, lte: opts.end } } : {}) },
    include: { sets: { select: { completed: true, weightKg: true, reps: true, exerciseId: true } } },
    orderBy: [{ date: "desc" }, { startedAt: "desc" }],
    take: opts.limit ?? 50,
  });
  return sessions.map((s) => ({
    id: s.id,
    name: s.name,
    date: s.date,
    status: s.status,
    durationMin: s.durationMin,
    effort: s.effort,
    exerciseCount: new Set(s.sets.map((x) => x.exerciseId)).size,
    completedSets: s.sets.filter((x) => x.completed).length,
    volumeKg: Math.round(s.sets.filter((x) => x.completed).reduce((sum, x) => sum + (x.weightKg ?? 0) * (x.reps ?? 0), 0)),
  }));
}

/** Records set in this session compared with all earlier completed sessions (heaviest weight, best est. 1RM, most reps). */
async function personalRecordsFor(userId: string, sessionId: string) {
  const sets = await db.workoutSet.findMany({ where: { sessionId, completed: true } });
  const records: { exerciseName: string; kind: string; value: number }[] = [];
  const byEx = new Map<string, typeof sets>();
  for (const s of sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
  for (const [exerciseId, exSets] of byEx) {
    const prior = await db.workoutSet.findMany({
      where: { exerciseId, completed: true, session: { userId, status: "completed", id: { not: sessionId } } },
      select: { weightKg: true, reps: true },
    });
    if (!prior.length) continue; // first time isn't a "record", just a baseline
    const bestW = Math.max(0, ...prior.map((p) => p.weightKg ?? 0));
    const best1 = Math.max(0, ...prior.filter((p) => p.weightKg && p.reps).map((p) => estimate1RM(p.weightKg!, p.reps!)));
    const bestReps = Math.max(0, ...prior.filter((p) => !p.weightKg).map((p) => p.reps ?? 0));
    const curW = Math.max(0, ...exSets.map((p) => p.weightKg ?? 0));
    const cur1 = Math.max(0, ...exSets.filter((p) => p.weightKg && p.reps).map((p) => estimate1RM(p.weightKg!, p.reps!)));
    const curReps = Math.max(0, ...exSets.filter((p) => !p.weightKg).map((p) => p.reps ?? 0));
    const name = exSets[0].exerciseName;
    if (curW > bestW && bestW > 0) records.push({ exerciseName: name, kind: "heaviest weight (kg)", value: curW });
    else if (cur1 > best1 && best1 > 0) records.push({ exerciseName: name, kind: "estimated 1-rep max (kg)", value: cur1 });
    if (curReps > bestReps && bestReps > 0) records.push({ exerciseName: name, kind: "most reps (bodyweight)", value: curReps });
  }
  return records;
}

/** Per-session progression for one exercise. */
export async function exerciseHistory(userId: string, exerciseId: string) {
  const sets = await db.workoutSet.findMany({
    where: { exerciseId, completed: true, session: { userId, status: "completed" } },
    include: { session: { select: { date: true, id: true } } },
    orderBy: { session: { date: "asc" } },
  });
  const bySession = new Map<string, { date: string; sets: typeof sets }>();
  for (const s of sets) {
    const k = s.session.id;
    if (!bySession.has(k)) bySession.set(k, { date: s.session.date, sets: [] });
    bySession.get(k)!.sets.push(s);
  }
  const points = [...bySession.values()].map(({ date, sets }) => ({
    date,
    sets: sets.length,
    topWeightKg: Math.max(0, ...sets.map((s) => s.weightKg ?? 0)) || null,
    totalReps: sets.reduce((a, s) => a + (s.reps ?? 0), 0),
    volumeKg: Math.round(sets.reduce((a, s) => a + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
    est1RM: Math.max(0, ...sets.filter((s) => s.weightKg && s.reps).map((s) => estimate1RM(s.weightKg!, s.reps!))) || null,
  }));
  const best = {
    weightKg: Math.max(0, ...points.map((p) => p.topWeightKg ?? 0)) || null,
    est1RM: Math.max(0, ...points.map((p) => p.est1RM ?? 0)) || null,
    reps: Math.max(0, ...sets.map((s) => s.reps ?? 0)) || null,
  };
  return { points, best, sessions: points.length };
}

export async function trainedExercises(userId: string) {
  const rows = await db.workoutSet.groupBy({ by: ["exerciseId", "exerciseName"], where: { completed: true, session: { userId, status: "completed" } }, _count: { _all: true } });
  return rows.map((r) => ({ exerciseId: r.exerciseId, name: r.exerciseName, sets: r._count._all })).sort((a, b) => b.sets - a.sets);
}

// ───────── One-shot logging (offline-friendly, also for past workouts) ─────────

export const quickLogSchema = z.object({
  clientId: zClientId,
  name: z.string().trim().min(1).max(100),
  date: zDate,
  durationMin: z.number().int().min(1).max(600),
  effort: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  templateId: z.string().nullable().optional(),
  sets: z
    .array(
      z.object({
        exerciseId: z.string(),
        reps: z.number().int().min(0).max(500).nullable().optional(),
        weightKg: z.number().min(0).max(1000).nullable().optional(),
        durationSec: z.number().int().min(0).max(36000).nullable().optional(),
        distanceM: z.number().min(0).max(1_000_000).nullable().optional(),
      }),
    )
    .min(1, "Add at least one set")
    .max(200),
});

export async function quickLogSession(userId: string, input: z.infer<typeof quickLogSchema>) {
  if (input.clientId) {
    const existing = await db.workoutSession.findUnique({ where: { userId_clientId: { userId, clientId: input.clientId } } });
    if (existing) return getSession(userId, existing.id);
  }
  const ids = [...new Set(input.sets.map((s) => s.exerciseId))];
  const exs = await db.exercise.findMany({ where: { id: { in: ids }, OR: [{ ownerId: null }, { ownerId: userId }] } });
  if (exs.length !== ids.length) throw badRequest("One of the exercises couldn't be found.");
  const counters = new Map<string, number>();
  const s = await db.workoutSession.create({
    data: {
      userId,
      clientId: input.clientId ?? null,
      templateId: input.templateId ?? null,
      name: input.name,
      date: input.date,
      status: "completed",
      endedAt: new Date(),
      durationMin: input.durationMin,
      effort: input.effort ?? null,
      notes: input.notes ?? null,
      sets: {
        create: input.sets.map((x) => {
          const i = counters.get(x.exerciseId) ?? 0;
          counters.set(x.exerciseId, i + 1);
          return { ...x, setIndex: i, completed: true, exerciseName: exs.find((e) => e.id === x.exerciseId)!.name };
        }),
      },
    },
  });
  return getSession(userId, s.id);
}
