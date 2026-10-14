import "server-only";
import { searchFoods, type FoodDTO } from "../services/food";
import { MACRO_KEYS, scaleNutrients, sumNutrients, plausiblePer100, type Per100 } from "@/lib/nutrition";
import { normalize } from "@/lib/text";

export type MatchedIngredient = {
  name: string;
  grams: number;
  food: { id: string; name: string; dataQuality: string } | null;
  per100: Per100 | null;
};

/**
 * Match an AI-proposed ingredient to the food database. Only accepts a match when the food name shares
 * the main words of the query, so we never attach unrelated nutrition data.
 */
export async function matchIngredient(userId: string, name: string, query: string | null | undefined): Promise<FoodDTO | null> {
  const q = (query || name).slice(0, 80);
  const results = await searchFoods(userId, q, 5);
  if (!results.length) return null;
  const qWords = normalize(q).split(" ").filter((w) => w.length > 2);
  const best = results.find((f) => {
    const n = normalize(`${f.name} ${Object.values(f.localNames ?? {}).join(" ")}`);
    return qWords.length > 0 && qWords.filter((w) => n.includes(w)).length >= Math.ceil(qWords.length / 2);
  });
  return best ?? null;
}

export async function matchIngredients(userId: string, ings: { name: string; grams: number; searchQuery?: string | null }[]) {
  const out: MatchedIngredient[] = [];
  for (const i of ings) {
    const f = await matchIngredient(userId, i.name, i.searchQuery);
    out.push({ name: i.name, grams: i.grams, food: f ? { id: f.id, name: f.name, dataQuality: f.dataQuality } : null, per100: f ? f.per100 : null });
  }
  return out;
}

/** Nutrition per serving from matched ingredients; status tells the UI how much is backed by database values. */
export function nutritionFromMatches(ings: MatchedIngredient[], servings: number, aiEstimatePerServing?: Per100 | null) {
  const matched = ings.filter((i) => i.per100);
  if (!matched.length) {
    const est = aiEstimatePerServing && plausibleServing(aiEstimatePerServing) ? aiEstimatePerServing : null;
    return { nutrition: est, status: est ? ("ai_estimate" as const) : ("unknown" as const) };
  }
  const total = sumNutrients(matched.map((i) => scaleNutrients(i.per100!, i.grams, MACRO_KEYS)), MACRO_KEYS);
  const per: Per100 = {};
  for (const k of MACRO_KEYS) per[k] = Math.round((total.values[k] / Math.max(1, servings)) * 10) / 10;
  return { nutrition: per, status: matched.length === ings.length ? ("calculated" as const) : ("partial" as const) };
}

function plausibleServing(n: Per100) {
  // per-serving values: just make sure macros and energy roughly agree and are positive.
  const kcal = n.kcal ?? 0;
  const macroKcal = (n.proteinG ?? 0) * 4 + (n.carbsG ?? 0) * 4 + (n.fatG ?? 0) * 9;
  return kcal > 0 && kcal < 3000 && Math.abs(kcal - macroKcal) < Math.max(80, kcal * 0.35);
}

export { plausiblePer100 };
