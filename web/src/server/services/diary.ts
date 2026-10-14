import "server-only";
import { z } from "zod";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { MACRO_KEYS, MEAL_TYPES, NUTRIENT_KEYS, plausiblePer100, scaleNutrients, sumNutrients, type Nutrients, type Per100 } from "@/lib/nutrition";
import { dateRange } from "@/lib/dates";
import { per100Schema } from "@/lib/validation";
import { zClientId, zDate } from "../http";
import { per100Of } from "./food";
import { recipeWithNutrition } from "./recipes";
import type { FoodLogEntry } from "@/generated/prisma/client";

const zMeal = z.enum(MEAL_TYPES);
const amount = { grams: z.number().positive().max(5000), quantity: z.number().positive().max(1000).default(1), unitLabel: z.string().max(60).default("g") };

export const addEntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("food"), foodId: z.string(), date: zDate, mealType: zMeal, clientId: zClientId, source: z.enum(["search", "barcode", "saved", "ai"]).default("search"), ...amount }),
  z.object({ kind: z.literal("recipe"), recipeId: z.string(), servings: z.number().positive().max(50), date: zDate, mealType: zMeal, clientId: zClientId }),
  z.object({
    // User-confirmed estimate (e.g. from photo analysis or a quick manual entry). Always flagged as an estimate.
    kind: z.literal("estimate"),
    name: z.string().trim().min(1).max(120),
    per100: per100Schema,
    date: zDate,
    mealType: zMeal,
    clientId: zClientId,
    source: z.enum(["photo", "quick", "ai"]),
    ...amount,
  }),
]);

export const updateEntrySchema = z.object({
  grams: z.number().positive().max(5000).optional(),
  quantity: z.number().positive().max(1000).optional(),
  unitLabel: z.string().max(60).optional(),
  mealType: zMeal.optional(),
  date: zDate.optional(),
});

function totalsFor(per100: Per100, grams: number) {
  const t = scaleNutrients(per100, grams, MACRO_KEYS);
  return { kcal: t.kcal ?? null, proteinG: t.proteinG ?? null, carbsG: t.carbsG ?? null, fatG: t.fatG ?? null, fiberG: t.fiberG ?? null, sugarG: t.sugarG ?? null, sodiumMg: t.sodiumMg ?? null };
}

function cleanPer100(p: Per100): Per100 {
  const out: Per100 = {};
  for (const k of NUTRIENT_KEYS) out[k] = p[k] ?? null;
  return out;
}

export function entryDTO(e: FoodLogEntry) {
  return {
    id: e.id,
    date: e.date,
    loggedAt: e.loggedAt,
    mealType: e.mealType,
    foodId: e.foodId,
    recipeId: e.recipeId,
    name: e.name,
    brand: e.brand,
    grams: e.grams,
    quantity: e.quantity,
    unitLabel: e.unitLabel,
    per100: e.per100 as Per100,
    totals: { kcal: e.kcal, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG, fiberG: e.fiberG, sugarG: e.sugarG, sodiumMg: e.sodiumMg } as Nutrients,
    isEstimate: e.isEstimate,
    source: e.source,
  };
}
export type DiaryEntry = ReturnType<typeof entryDTO>;

export async function addEntry(userId: string, input: z.infer<typeof addEntrySchema>) {
  if (input.clientId) {
    const existing = await db.foodLogEntry.findUnique({ where: { userId_clientId: { userId, clientId: input.clientId } } });
    if (existing) return entryDTO(existing); // idempotent replay
  }
  const base = { userId, clientId: input.clientId ?? null, date: input.date, mealType: input.mealType };

  if (input.kind === "food") {
    const food = await db.food.findFirst({ where: { id: input.foodId, OR: [{ ownerId: null }, { ownerId: userId }] } });
    if (!food) throw notFound("food");
    const per100 = per100Of(food);
    const e = await db.foodLogEntry.create({
      data: {
        ...base,
        foodId: food.id,
        name: food.name,
        brand: food.brand,
        grams: input.grams,
        quantity: input.quantity,
        unitLabel: input.unitLabel,
        per100,
        ...totalsFor(per100, input.grams),
        isEstimate: food.dataQuality === "estimate",
        source: input.source,
      },
    });
    return entryDTO(e);
  }

  if (input.kind === "recipe") {
    const r = await recipeWithNutrition(userId, input.recipeId);
    const grams = r.nutrition.gramsPerServing * input.servings;
    if (grams <= 0) throw badRequest("This recipe has no ingredient amounts yet.");
    const e = await db.foodLogEntry.create({
      data: {
        ...base,
        recipeId: r.id,
        name: r.name,
        grams,
        quantity: input.servings,
        unitLabel: input.servings === 1 ? "serving" : "servings",
        per100: r.nutrition.per100,
        ...totalsFor(r.nutrition.per100, grams),
        isEstimate: !r.nutrition.complete,
        source: "recipe",
      },
    });
    return entryDTO(e);
  }

  const per100 = cleanPer100(input.per100);
  const check = plausiblePer100(per100);
  if (!check.ok) throw badRequest(`These nutrition values don't look right (${check.reason}).`);
  const e = await db.foodLogEntry.create({
    data: {
      ...base,
      name: input.name,
      grams: input.grams,
      quantity: input.quantity,
      unitLabel: input.unitLabel,
      per100,
      ...totalsFor(per100, input.grams),
      isEstimate: true,
      source: input.source,
    },
  });
  return entryDTO(e);
}

export async function updateEntry(userId: string, id: string, input: z.infer<typeof updateEntrySchema>) {
  const e = await db.foodLogEntry.findFirst({ where: { id, userId } });
  if (!e) throw notFound("diary entry");
  const grams = input.grams ?? e.grams;
  const updated = await db.foodLogEntry.update({
    where: { id },
    data: { ...input, ...totalsFor(e.per100 as Per100, grams) },
  });
  return entryDTO(updated);
}

export async function deleteEntry(userId: string, id: string) {
  const { count } = await db.foodLogEntry.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("diary entry");
}

export async function dayDiary(userId: string, date: string) {
  const entries = (await db.foodLogEntry.findMany({ where: { userId, date }, orderBy: { loggedAt: "asc" } })).map(entryDTO);
  const meals = Object.fromEntries(
    MEAL_TYPES.map((m) => {
      const items = entries.filter((e) => e.mealType === m);
      return [m, { entries: items, totals: sumNutrients(items.map((i) => i.totals), MACRO_KEYS) }];
    }),
  ) as Record<(typeof MEAL_TYPES)[number], { entries: DiaryEntry[]; totals: ReturnType<typeof sumNutrients> }>;
  return {
    date,
    meals,
    totals: sumNutrients(entries.map((e) => e.totals), MACRO_KEYS),
    estimateCount: entries.filter((e) => e.isEstimate).length,
    entryCount: entries.length,
  };
}

/** Micronutrient totals for a day — only from entries whose snapshot includes the nutrient. */
export async function dayMicros(userId: string, date: string) {
  const entries = await db.foodLogEntry.findMany({ where: { userId, date }, select: { per100: true, grams: true } });
  const items = entries.map((e) => scaleNutrients(e.per100 as Per100, e.grams));
  return sumNutrients(items);
}

/** Per-day totals over a range. Days without entries are `null` (no data) — not zero. */
export async function nutritionRange(userId: string, start: string, end: string) {
  const entries = await db.foodLogEntry.findMany({
    where: { userId, date: { gte: start, lte: end } },
    select: { date: true, kcal: true, proteinG: true, carbsG: true, fatG: true, fiberG: true, isEstimate: true },
  });
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return dateRange(start, end).map((date) => {
    const items = byDay.get(date);
    if (!items?.length) return { date, logged: false as const };
    const t = sumNutrients(items, ["kcal", "proteinG", "carbsG", "fatG", "fiberG"]);
    return { date, logged: true as const, entries: items.length, estimates: items.filter((i) => i.isEstimate).length, ...t.values };
  });
}

export async function copyMeal(userId: string, from: { date: string; mealType: string }, to: { date: string; mealType: string }) {
  const src = await db.foodLogEntry.findMany({ where: { userId, date: from.date, mealType: from.mealType } });
  if (!src.length) throw badRequest("There's nothing logged in that meal to copy.");
  await db.foodLogEntry.createMany({
    data: src.map(({ id: _id, clientId: _c, loggedAt: _l, updatedAt: _u, date: _d, mealType: _m, ...rest }) => ({
      ...rest,
      per100: rest.per100 as object,
      date: to.date,
      mealType: to.mealType,
      source: "saved",
    })),
  });
  return src.length;
}

// ── Saved (favourite) meals ──

export async function saveMealFromDiary(userId: string, date: string, mealType: string, name: string) {
  const entries = await db.foodLogEntry.findMany({ where: { userId, date, mealType } });
  if (!entries.length) throw badRequest("Log something in this meal first, then save it.");
  return db.savedMeal.create({
    data: {
      userId,
      name,
      mealType,
      items: entries.map((e) => ({ foodId: e.foodId, name: e.name, brand: e.brand, grams: e.grams, quantity: e.quantity, unitLabel: e.unitLabel, per100: e.per100, isEstimate: e.isEstimate })),
    },
  });
}

type SavedItem = { foodId: string | null; name: string; brand: string | null; grams: number; quantity: number; unitLabel: string; per100: Per100; isEstimate: boolean };

export async function listSavedMeals(userId: string) {
  const meals = await db.savedMeal.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return meals.map((m) => {
    const items = m.items as SavedItem[];
    return { id: m.id, name: m.name, mealType: m.mealType, items, totals: sumNutrients(items.map((i) => scaleNutrients(i.per100, i.grams, MACRO_KEYS)), MACRO_KEYS) };
  });
}

export async function logSavedMeal(userId: string, savedMealId: string, date: string, mealType: string) {
  const meal = await db.savedMeal.findFirst({ where: { id: savedMealId, userId } });
  if (!meal) throw notFound("saved meal");
  const items = meal.items as SavedItem[];
  await db.foodLogEntry.createMany({
    data: items.map((i) => ({
      userId,
      date,
      mealType,
      foodId: i.foodId,
      name: i.name,
      brand: i.brand,
      grams: i.grams,
      quantity: i.quantity,
      unitLabel: i.unitLabel,
      per100: i.per100,
      ...totalsFor(i.per100, i.grams),
      isEstimate: i.isEstimate,
      source: "saved",
    })),
  });
  return items.length;
}

export async function deleteSavedMeal(userId: string, id: string) {
  const { count } = await db.savedMeal.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("saved meal");
}
