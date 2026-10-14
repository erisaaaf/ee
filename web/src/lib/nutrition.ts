// Pure nutrition math, shared by client and server.
// IMPORTANT: null means "unknown" and is never silently treated as 0 in a way that hides it —
// totals carry `missing` counts so the UI can say "at least X kcal (some foods lack data)".

export const MACRO_KEYS = ["kcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarG", "sodiumMg"] as const;
export const MICRO_KEYS = [
  "ironMg",
  "calciumMg",
  "potassiumMg",
  "magnesiumMg",
  "vitAUg",
  "vitCMg",
  "vitDUg",
  "vitB12Ug",
  "folateUg",
] as const;
export const NUTRIENT_KEYS = [...MACRO_KEYS, ...MICRO_KEYS] as const;

export type MacroKey = (typeof MACRO_KEYS)[number];
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Partial<Record<NutrientKey, number | null>>;
export type Per100 = Nutrients;

export const NUTRIENT_META: Record<NutrientKey, { label: string; unit: string; short?: string }> = {
  kcal: { label: "Energy", unit: "kcal", short: "Calories" },
  proteinG: { label: "Protein", unit: "g" },
  carbsG: { label: "Carbohydrates", unit: "g", short: "Carbs" },
  fatG: { label: "Fat", unit: "g" },
  fiberG: { label: "Fiber", unit: "g" },
  sugarG: { label: "Sugars", unit: "g" },
  sodiumMg: { label: "Sodium", unit: "mg" },
  ironMg: { label: "Iron", unit: "mg" },
  calciumMg: { label: "Calcium", unit: "mg" },
  potassiumMg: { label: "Potassium", unit: "mg" },
  magnesiumMg: { label: "Magnesium", unit: "mg" },
  vitAUg: { label: "Vitamin A", unit: "µg" },
  vitCMg: { label: "Vitamin C", unit: "mg" },
  vitDUg: { label: "Vitamin D", unit: "µg" },
  vitB12Ug: { label: "Vitamin B12", unit: "µg" },
  folateUg: { label: "Folate", unit: "µg" },
};

const round = (v: number, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Nutrients for `grams` of a food given per-100 g values. Unknown stays unknown (null). */
export function scaleNutrients(per100: Per100, grams: number, keys: readonly NutrientKey[] = NUTRIENT_KEYS): Nutrients {
  const out: Nutrients = {};
  for (const k of keys) {
    const v = per100[k];
    out[k] = v == null || !Number.isFinite(v) ? null : round((v * grams) / 100, k === "kcal" ? 0 : 2);
  }
  return out;
}

export type Totals = {
  values: Record<NutrientKey, number>;
  /** How many items had no data for each nutrient (so the total is a lower bound). */
  missing: Record<NutrientKey, number>;
  count: number;
};

/** Sum nutrient totals. Unknown values are counted in `missing` rather than hidden. */
export function sumNutrients(items: Nutrients[], keys: readonly NutrientKey[] = NUTRIENT_KEYS): Totals {
  const values = {} as Record<NutrientKey, number>;
  const missing = {} as Record<NutrientKey, number>;
  for (const k of keys) {
    values[k] = 0;
    missing[k] = 0;
  }
  for (const item of items) {
    for (const k of keys) {
      const v = item[k];
      if (v == null || !Number.isFinite(v)) missing[k]++;
      else values[k] += v;
    }
  }
  for (const k of keys) values[k] = round(values[k], k === "kcal" ? 0 : 1);
  return { values, missing, count: items.length };
}

export type RecipeIngredientInput = { grams: number; per100: Per100 | null };

/** Recipe totals and per-serving values. `complete` is false if any ingredient lacks nutrition data. */
export function recipeNutrition(ingredients: RecipeIngredientInput[], servings: number) {
  const parts = ingredients.map((i) => (i.per100 ? scaleNutrients(i.per100, i.grams) : ({} as Nutrients)));
  const total = sumNutrients(parts);
  const safeServings = servings > 0 ? servings : 1;
  const perServing = {} as Record<NutrientKey, number>;
  for (const k of NUTRIENT_KEYS) perServing[k] = round(total.values[k] / safeServings, k === "kcal" ? 0 : 1);
  const totalGrams = ingredients.reduce((s, i) => s + i.grams, 0);
  const unlinked = ingredients.filter((i) => !i.per100).length;
  // per-100 g of the finished dish (raw-weight basis), so a recipe can be logged like a food.
  const per100: Per100 = {};
  for (const k of NUTRIENT_KEYS) {
    per100[k] = totalGrams > 0 && total.missing[k] < ingredients.length ? round((total.values[k] * 100) / totalGrams, 2) : null;
  }
  return {
    total,
    perServing,
    per100,
    totalGrams: round(totalGrams, 0),
    gramsPerServing: round(totalGrams / safeServings, 0),
    complete: unlinked === 0 && total.missing.kcal === 0,
    unlinkedIngredients: unlinked,
  };
}

/** Energy from macros (Atwater factors) — used to sanity-check AI or user input. */
export function kcalFromMacros(proteinG = 0, carbsG = 0, fatG = 0) {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

/** Validate a per-100 g profile is physically plausible (protects against bad external/AI data). */
export function plausiblePer100(n: Per100): { ok: boolean; reason?: string } {
  const p = n.proteinG ?? 0;
  const c = n.carbsG ?? 0;
  const f = n.fatG ?? 0;
  if ([n.kcal, p, c, f].some((v) => v != null && (v as number) < 0)) return { ok: false, reason: "negative value" };
  if (p + c + f > 100.5) return { ok: false, reason: "macros exceed 100 g per 100 g" };
  if (n.kcal != null && n.kcal > 900) return { ok: false, reason: "energy above 900 kcal/100 g" };
  return { ok: true };
}

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];
