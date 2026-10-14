import "server-only";
import { z } from "zod";
import { db } from "../db";
import { badRequest, notFound, AppError } from "../errors";
import { addDays, isDateStr, weekStart } from "@/lib/dates";
import { allergenConflicts, dietConflicts } from "@/lib/allergens";
import { plausiblePer100, type Per100 } from "@/lib/nutrition";
import { normalize } from "@/lib/text";
import { guardAi } from "./provider";
import { structured, REFUSAL_MESSAGE } from "./core";
import { matchIngredient, matchIngredients, nutritionFromMatches } from "./matching";
import { getMe } from "../services/profile";
import { aiAccess } from "./tools";
import { dashboard, weekSummary, localNow } from "../services/analytics";

// ───────────────────── Food photo analysis ─────────────────────

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Validate a data-URL image by its magic bytes (not just the declared type). */
export function decodeImage(dataUrl: string) {
  const m = dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw badRequest("Please upload a JPEG, PNG or WebP photo.");
  const buf = Buffer.from(m[3], "base64");
  if (buf.length > MAX_IMAGE_BYTES) throw badRequest("That photo is too large. Please use one under 5 MB.");
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
  const actual = isJpeg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : null;
  if (!actual) throw badRequest("That file doesn't look like a supported image.");
  return { mediaType: actual as "image/jpeg" | "image/png" | "image/webp", base64: m[3] };
}

const PhotoSchema = z.object({
  isFood: z.boolean(),
  imageQuality: z.enum(["good", "blurry", "too_dark", "partial", "unclear"]),
  items: z.array(
    z.object({
      name: z.string(),
      searchQuery: z.string(),
      estimatedGrams: z.number(),
      portionConfidence: z.enum(["low", "medium", "high"]),
      identificationConfidence: z.enum(["low", "medium", "high"]),
      likelyIngredients: z.array(z.string()),
      per100Estimate: z.object({ kcal: z.number(), proteinG: z.number(), carbsG: z.number(), fatG: z.number(), fiberG: z.number() }),
    }),
  ),
  notes: z.string(),
});

export async function analyzeFoodPhoto(userId: string, imageDataUrl: string, hint?: string) {
  await guardAi(userId, "photo");
  const img = decodeImage(imageDataUrl);
  const { data, refused } = await structured({
    schema: PhotoSchema,
    effort: "medium",
    maxTokens: 6000,
    system: `Task: identify the foods visible in a meal photo and estimate portions.
- If the image does not show food or drink, set isFood=false and return no items.
- If the photo is blurry/dark/partial, say so in imageQuality and notes; still give your best low-confidence guess if food is visible.
- One item per distinct food. searchQuery: a short generic English name to look up in a food database (e.g. "white rice cooked").
- estimatedGrams: realistic grams (or ml for drinks) for the visible portion. Portions from a photo are uncertain — reflect that in portionConfidence.
- per100Estimate: typical values per 100 g for that food as prepared. These are estimates, not measurements.
- notes: one or two sentences about uncertainty (e.g. hidden oil, sauces, plate size).`,
    content: [
      { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } },
      { type: "text", text: hint ? `The user adds: "${hint.slice(0, 300)}"` : "Analyse this meal photo." },
    ],
  });
  if (refused || !data) return { refused: true, message: REFUSAL_MESSAGE, items: [] };
  if (!data.isFood) return { refused: false, isFood: false, imageQuality: data.imageQuality, notes: data.notes || "We couldn't see any food in this photo.", items: [] };

  const items = [];
  for (const it of data.items.slice(0, 12)) {
    const grams = Math.round(Math.min(2000, Math.max(1, it.estimatedGrams)));
    const est: Per100 = { ...it.per100Estimate };
    const aiPer100 = plausiblePer100(est).ok ? est : null;
    const match = await matchIngredient(userId, it.name, it.searchQuery);
    items.push({
      name: it.name,
      grams,
      portionConfidence: it.portionConfidence,
      identificationConfidence: it.identificationConfidence,
      likelyIngredients: it.likelyIngredients.slice(0, 10),
      aiPer100,
      databaseMatch: match ? { id: match.id, name: match.name, dataQuality: match.dataQuality, per100: match.per100, servings: match.servings } : null,
    });
  }
  // The photo itself is not stored.
  return { refused: false, isFood: true, imageQuality: data.imageQuality, notes: data.notes, items, disclaimer: "These are estimates from a photo. Portion sizes and hidden ingredients (oil, sauces) can't be measured from an image — please check and correct before saving." };
}

// ───────────────────── Meal planning ─────────────────────

export const mealPlanRequestSchema = z.object({
  days: z.number().int().min(1).max(7),
  startDate: z.string().refine(isDateStr),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner", "snack"])).min(1),
  diet: z.string().max(40).optional(),
  extraAllergies: z.array(z.string().max(40)).max(10).default([]),
  avoid: z.array(z.string().max(40)).max(20).default([]),
  availableIngredients: z.array(z.string().max(40)).max(30).default([]),
  budget: z.enum(["low", "medium", "flexible"]).optional(),
  maxCookingMinutes: z.number().int().min(5).max(240).optional(),
  cuisines: z.array(z.string().max(40)).max(8).default([]),
  notes: z.string().max(500).optional(),
});

const MealSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  title: z.string(),
  description: z.string(),
  prepMinutes: z.number(),
  servings: z.number(),
  ingredients: z.array(z.object({ name: z.string(), grams: z.number(), searchQuery: z.string() })),
  instructions: z.string(),
  substitutions: z.array(z.string()),
  estimatedPerServing: z.object({ kcal: z.number(), proteinG: z.number(), carbsG: z.number(), fatG: z.number(), fiberG: z.number() }),
});
const PlanSchema = z.object({ title: z.string(), days: z.array(z.object({ meals: z.array(MealSchema) })), generalTips: z.array(z.string()) });

async function planContext(userId: string, req: z.infer<typeof mealPlanRequestSchema>) {
  const me = await getMe(userId);
  const access = await aiAccess(userId);
  const allergies = [...new Set([...me.preferences.allergies, ...req.extraAllergies])];
  const diet = req.diet ?? me.preferences.dietPattern;
  const lines = [
    `Diet pattern: ${diet}.`,
    `Allergies/intolerances (NEVER include): ${allergies.join(", ") || "none recorded"}.`,
    `Dislikes / avoid: ${[...me.preferences.dislikes, ...req.avoid].join(", ") || "none"}.`,
    `Likes: ${me.preferences.likes.join(", ") || "not specified"}. Cuisines: ${[...me.preferences.cuisines, ...req.cuisines].join(", ") || "any (local Balkan dishes welcome)"}.`,
    `Budget: ${req.budget ?? me.preferences.budget ?? "not specified"}. Max cooking time per meal: ${req.maxCookingMinutes ?? me.preferences.cookingTimeMin ?? "not specified"} min. Cooking skill: ${me.preferences.cookingSkill ?? "not specified"}.`,
    req.availableIngredients.length ? `Prioritise these ingredients the user already has: ${req.availableIngredients.join(", ")}.` : "",
    me.profile.isMinor
      ? "The user is under 18: plan balanced, satisfying meals. No calorie targets or restriction."
      : access.has("profile") && me.targets.calorieTarget
        ? `Approximate daily energy target (an estimate, not a strict limit): ${me.targets.calorieTarget} kcal; protein around ${me.targets.proteinTargetG ?? "?"} g.`
        : "No calorie target — just balanced meals.",
    req.notes ? `User notes: ${req.notes}` : "",
  ];
  return { me, allergies, diet, text: lines.filter(Boolean).join("\n") };
}

async function finalizeMeal(userId: string, meal: z.infer<typeof MealSchema>, allergies: string[], diet: string) {
  const servings = Math.min(12, Math.max(1, Math.round(meal.servings)));
  const ings = meal.ingredients.slice(0, 25).map((i) => ({ name: i.name.slice(0, 80), grams: Math.min(3000, Math.max(1, Math.round(i.grams))), searchQuery: i.searchQuery }));
  const matched = await matchIngredients(userId, ings);
  const { nutrition, status } = nutritionFromMatches(matched, servings, meal.estimatedPerServing);
  const names = ings.map((i) => i.name);
  const warnings = [
    ...allergenConflicts(names, allergies).map((c) => `Contains ${c.ingredient} — conflicts with your ${c.allergen} allergy/intolerance.`),
    ...dietConflicts(names, diet).map((n) => `${n} may not fit your ${diet} diet.`),
  ];
  return {
    mealType: meal.mealType,
    title: meal.title.slice(0, 120),
    description: [meal.description, meal.substitutions.length ? `Swaps: ${meal.substitutions.join("; ")}` : ""].filter(Boolean).join("\n").slice(0, 2000),
    ingredients: matched.map((m) => ({ name: m.name, grams: m.grams, foodId: m.food?.id ?? null, matchedName: m.food?.name ?? null, per100: m.per100 })),
    instructions: meal.instructions.slice(0, 5000),
    prepMinutes: Math.round(Math.min(600, Math.max(0, meal.prepMinutes))),
    servings,
    nutrition: nutrition ?? undefined,
    nutritionStatus: status,
    allergenWarnings: warnings,
  };
}

export async function generateMealPlan(userId: string, req: z.infer<typeof mealPlanRequestSchema>) {
  await guardAi(userId, "meal_plan");
  const ctx = await planContext(userId, req);
  const { data, refused } = await structured({
    schema: PlanSchema,
    effort: "medium",
    maxTokens: 20000,
    system: `Task: create a ${req.days}-day meal plan with these meals each day: ${req.mealTypes.join(", ")}.
${ctx.text}
Rules: realistic home cooking; vary meals; ingredient grams are for the whole recipe (all servings); searchQuery is a short generic English food name for database lookup (e.g. "chicken breast raw", "olive oil"). estimatedPerServing is a rough estimate. Include practical substitutions. Never guarantee health outcomes.`,
    content: "Create the meal plan.",
  });
  if (refused || !data) throw new AppError(422, "ai_refused", REFUSAL_MESSAGE);
  const plan = await db.mealPlan.create({
    data: { userId, title: data.title.slice(0, 120) || "Meal plan", startDate: req.startDate, days: req.days, request: { ...req, diet: ctx.diet, allergies: ctx.allergies, tips: data.generalTips.slice(0, 6) } },
  });
  for (const [dayIndex, day] of data.days.slice(0, req.days).entries()) {
    for (const meal of day.meals.filter((m) => req.mealTypes.includes(m.mealType))) {
      const f = await finalizeMeal(userId, meal, ctx.allergies, ctx.diet);
      await db.mealPlanItem.create({ data: { planId: plan.id, dayIndex, ...f } });
    }
  }
  return getMealPlan(userId, plan.id);
}

export async function replaceMeal(userId: string, planId: string, itemId: string, instruction?: string) {
  await guardAi(userId, "meal_plan");
  const plan = await db.mealPlan.findFirst({ where: { id: planId, userId }, include: { items: true } });
  if (!plan) throw notFound("meal plan");
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) throw notFound("meal");
  const req = mealPlanRequestSchema.parse({ ...(plan.request as object), extraAllergies: (plan.request as { allergies?: string[] }).allergies ?? [] });
  const ctx = await planContext(userId, req);
  const others = plan.items.filter((i) => i.dayIndex === item.dayIndex && i.id !== itemId).map((i) => i.title);
  const { data, refused } = await structured({
    schema: z.object({ meal: MealSchema }),
    effort: "low",
    maxTokens: 6000,
    system: `Task: suggest ONE replacement ${item.mealType} for a meal plan.\n${ctx.text}\nThe meal being replaced: "${item.title}". Other meals that day: ${others.join(", ") || "none"}. Make it clearly different.${instruction ? ` The user asks: "${instruction.slice(0, 300)}".` : ""}`,
    content: "Suggest the replacement meal.",
  });
  if (refused || !data) throw new AppError(422, "ai_refused", REFUSAL_MESSAGE);
  const f = await finalizeMeal(userId, { ...data.meal, mealType: item.mealType as z.infer<typeof MealSchema>["mealType"] }, ctx.allergies, ctx.diet);
  await db.mealPlanItem.update({ where: { id: itemId }, data: f });
  return getMealPlan(userId, planId);
}

export async function getMealPlan(userId: string, id: string) {
  const p = await db.mealPlan.findFirst({ where: { id, userId }, include: { items: { orderBy: [{ dayIndex: "asc" }] } } });
  if (!p) throw notFound("meal plan");
  const order = ["breakfast", "lunch", "dinner", "snack"];
  return { ...p, items: p.items.sort((a, b) => a.dayIndex - b.dayIndex || order.indexOf(a.mealType) - order.indexOf(b.mealType)) };
}

export async function listMealPlans(userId: string) {
  return db.mealPlan.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, startDate: true, days: true, createdAt: true } });
}

export async function deleteMealPlan(userId: string, id: string) {
  const { count } = await db.mealPlan.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("meal plan");
}

/** Scale a plan meal's servings — ingredient grams and nutrition per serving stay consistent. */
export async function adjustMealServings(userId: string, planId: string, itemId: string, servings: number) {
  const plan = await db.mealPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw notFound("meal plan");
  const item = await db.mealPlanItem.findFirst({ where: { id: itemId, planId } });
  if (!item) throw notFound("meal");
  const factor = servings / item.servings;
  const ings = (item.ingredients as { name: string; grams: number }[]).map((i) => ({ ...i, grams: Math.round(i.grams * factor) }));
  await db.mealPlanItem.update({ where: { id: itemId }, data: { servings, ingredients: ings } });
  return getMealPlan(userId, planId);
}

// ── Grocery list (deterministic aggregation, no AI needed) ──

const GROCERY_CATEGORY: [string, RegExp][] = [
  ["Protein", /chicken|beef|pork|lamb|turkey|fish|salmon|tuna|cod|egg|tofu|lentil|bean|chickpea|shrimp|mince|meat/],
  ["Dairy", /milk|cheese|yogurt|yoghurt|kefir|butter|cream|feta|kos|djathe/],
  ["Grains & bread", /rice|pasta|bread|oat|flour|couscous|bulgur|quinoa|noodle|tortilla|pita/],
  ["Vegetables", /tomato|pepper|onion|garlic|carrot|spinach|lettuce|cucumber|zucchini|eggplant|potato|broccoli|cabbage|mushroom|bean|pea|corn|cauliflower|leek|celery/],
  ["Fruit", /apple|banana|orange|lemon|berry|berries|grape|pear|peach|kiwi|avocado|fig|date|plum|melon/],
  ["Pantry", /oil|salt|pepper|spice|vinegar|sugar|honey|sauce|paste|stock|herb|nut|seed|tahini/],
];

export async function groceryListFromPlan(userId: string, planId: string) {
  const plan = await getMealPlan(userId, planId);
  const totals = new Map<string, { name: string; grams: number }>();
  for (const it of plan.items) {
    for (const ing of it.ingredients as { name: string; grams: number }[]) {
      const key = normalize(ing.name);
      const cur = totals.get(key);
      totals.set(key, { name: cur?.name ?? ing.name, grams: (cur?.grams ?? 0) + ing.grams });
    }
  }
  const items = [...totals.values()].map((t) => {
    const n = normalize(t.name);
    const category = GROCERY_CATEGORY.find(([, re]) => re.test(n))?.[0] ?? "Other";
    return { name: t.name, category, quantity: t.grams >= 1000 ? `${Math.round(t.grams / 100) / 10} kg` : `${Math.round(t.grams)} g` };
  });
  const list = await db.groceryList.create({ data: { userId, planId, title: `Groceries: ${plan.title}`.slice(0, 120), items: { create: items } }, include: { items: true } });
  return list;
}

// ───────────────────── Recipe generator ("What do I have?") ─────────────────────

export const recipeIdeasSchema = z.object({
  ingredients: z.array(z.string().trim().min(1).max(40)).min(1).max(30),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "any"]).default("any"),
  maxMinutes: z.number().int().min(5).max(240).optional(),
  servings: z.number().int().min(1).max(12).default(2),
  budget: z.enum(["low", "medium", "flexible"]).optional(),
  adjust: z.array(z.enum(["higher_protein", "cheaper", "vegetarian", "quicker", "fewer_ingredients"])).max(5).default([]),
  baseRecipe: z.string().max(4000).optional(), // JSON of a previous draft to adjust
});

const RecipeIdeaSchema = z.object({
  recipes: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      prepMinutes: z.number(),
      servings: z.number(),
      usesFromPantry: z.array(z.string()),
      extraIngredientsNeeded: z.array(z.string()),
      ingredients: z.array(z.object({ name: z.string(), grams: z.number(), searchQuery: z.string() })),
      instructions: z.string(),
      estimatedPerServing: z.object({ kcal: z.number(), proteinG: z.number(), carbsG: z.number(), fatG: z.number(), fiberG: z.number() }),
    }),
  ),
});

export async function generateRecipeIdeas(userId: string, req: z.infer<typeof recipeIdeasSchema>) {
  await guardAi(userId, "recipes");
  const me = await getMe(userId);
  const adjustText: Record<string, string> = {
    higher_protein: "make it higher in protein",
    cheaper: "make it cheaper",
    vegetarian: "make it vegetarian",
    quicker: "reduce preparation time",
    fewer_ingredients: "use fewer ingredients",
  };
  const { data, refused } = await structured({
    schema: RecipeIdeaSchema,
    effort: "medium",
    maxTokens: 12000,
    system: `Task: ${req.baseRecipe ? "adjust the given recipe" : "suggest 3 different recipes"} for "${req.mealType}" using what the user has.
Priorities in order: 1) ingredients they already have, 2) their preferences, 3) sensible nutrition, 4) preparation time, 5) budget.
Ingredients at home: ${req.ingredients.join(", ")}.
Diet: ${me.preferences.dietPattern}. Allergies (NEVER include): ${me.preferences.allergies.join(", ") || "none"}. Dislikes: ${me.preferences.dislikes.join(", ") || "none"}.
Servings: ${req.servings}. ${req.maxMinutes ? `Max ${req.maxMinutes} minutes.` : ""} ${req.budget ? `Budget: ${req.budget}.` : ""}
${req.adjust.length ? `Adjustments requested: ${req.adjust.map((a) => adjustText[a]).join(", ")}.` : ""}
Ingredient grams are for the whole recipe. searchQuery is a short generic English food name for database lookup. estimatedPerServing is a rough estimate.`,
    content: req.baseRecipe ? `Recipe to adjust (JSON): ${req.baseRecipe}` : "Suggest recipes.",
  });
  if (refused || !data) throw new AppError(422, "ai_refused", REFUSAL_MESSAGE);
  const out = [];
  for (const r of data.recipes.slice(0, 3)) {
    const servings = Math.min(12, Math.max(1, Math.round(r.servings)));
    const matched = await matchIngredients(userId, r.ingredients.slice(0, 25).map((i) => ({ name: i.name, grams: Math.max(1, Math.round(i.grams)), searchQuery: i.searchQuery })));
    const { nutrition, status } = nutritionFromMatches(matched, servings, r.estimatedPerServing);
    out.push({
      ...r,
      servings,
      prepMinutes: Math.round(Math.max(0, r.prepMinutes)),
      ingredients: matched.map((m) => ({ name: m.name, grams: m.grams, foodId: m.food?.id ?? null, matchedName: m.food?.name ?? null })),
      nutritionPerServing: nutrition,
      nutritionStatus: status,
      allergenWarnings: allergenConflicts(matched.map((m) => m.name), me.preferences.allergies).map((c) => `Contains ${c.ingredient} (${c.allergen})`),
    });
  }
  return out;
}

// ───────────────────── AI food swaps ─────────────────────

const SwapSchema = z.object({ swaps: z.array(z.object({ instead: z.string(), tryThis: z.string(), why: z.string(), tradeOff: z.string() })) });

export async function aiSwaps(userId: string, item: string, reason?: string) {
  await guardAi(userId, "swaps");
  const me = await getMe(userId);
  const { data, refused } = await structured({
    schema: SwapSchema,
    effort: "low",
    maxTokens: 4000,
    system: `Task: suggest up to 4 practical alternatives for a food or ingredient. Explain why each might be useful (e.g. more fibre, more protein, easier to find, cheaper, fits a diet) and any trade-off. Never describe foods as good/bad, clean/junk, or use guilt. Diet: ${me.preferences.dietPattern}. Allergies (never suggest): ${me.preferences.allergies.join(", ") || "none"}. Budget: ${me.preferences.budget ?? "not specified"}.`,
    content: `Food: "${item.slice(0, 100)}".${reason ? ` What the user wants: ${reason.slice(0, 200)}` : ""}`,
  });
  if (refused || !data) throw new AppError(422, "ai_refused", REFUSAL_MESSAGE);
  return data.swaps.map((s) => ({ ...s, allergenWarnings: allergenConflicts([s.tryThis], me.preferences.allergies).map((c) => c.allergen) }));
}

// ───────────────────── Daily insight & weekly review ─────────────────────

const InsightSchema = z.object({ insight: z.string(), category: z.enum(["nutrition", "hydration", "activity", "workout", "sleep", "recovery", "wellbeing", "general"]) });

export async function dailyInsight(userId: string, refresh = false) {
  const settings = await db.settings.findUnique({ where: { userId } });
  if (settings && !settings.dailyInsight) return { enabled: false as const };
  const { today, hour } = await localNow(userId);
  const key = `${today}-${hour < 12 ? "am" : hour < 18 ? "pm" : "eve"}`;
  if (!refresh) {
    const cached = await db.aiInsight.findUnique({ where: { userId_kind_periodKey: { userId, kind: "daily", periodKey: key } } });
    if (cached) return { enabled: true as const, ...(cached.content as object), cached: true, generatedAt: cached.createdAt };
  }
  await guardAi(userId, "insight");
  const access = await aiAccess(userId);
  const d = await dashboard(userId);
  const facts = {
    localHour: hour,
    nutrition: access.has("nutrition") ? { kcal: d.nutrition.kcal, proteinG: d.nutrition.proteinG, entries: d.nutrition.entries } : "not authorised",
    water: access.has("hydration") ? d.water : "not authorised",
    steps: access.has("activity") ? d.steps : "not authorised",
    activityMinutes: access.has("activity") ? d.activity.minutes : "not authorised",
    workout: access.has("workouts") ? { completedToday: d.workout.completed.length, scheduled: d.workout.scheduled.map((s) => s.name) } : "not authorised",
    sleepLastNight: access.has("sleep") ? d.sleep : "not authorised",
    wellbeing: access.has("wellbeing") ? d.wellbeing : "not authorised",
    recoveryEstimate: d.recovery.status,
    goals: access.has("goals") ? { met: d.goals.met, total: d.goals.total } : "not authorised",
  };
  const { data, refused } = await structured({
    schema: InsightSchema,
    effort: "low",
    maxTokens: 2000,
    system: "Task: write ONE short (max 2 sentences), encouraging, specific insight about the user's day so far from the data given. Mention one useful next step. If little data is logged, gently suggest logging one thing. No medical claims. Remember it's only partway through the day.",
    content: JSON.stringify(facts),
  });
  if (refused || !data) return { enabled: true as const, insight: null, refused: true };
  const content = { insight: data.insight, category: data.category };
  await db.aiInsight.upsert({ where: { userId_kind_periodKey: { userId, kind: "daily", periodKey: key } }, create: { userId, kind: "daily", periodKey: key, content }, update: { content, createdAt: new Date() } });
  return { enabled: true as const, ...content, cached: false, generatedAt: new Date() };
}

const WeeklySchema = z.object({ wentWell: z.array(z.string()), trends: z.array(z.string()), areasToImprove: z.array(z.string()), nextWeek: z.array(z.string()) });

export async function weeklyReview(userId: string, weekStartDate?: string, refresh = false) {
  const settings = await db.settings.findUnique({ where: { userId } });
  const { today } = await localNow(userId);
  // Default: the most recent complete week.
  const ws = weekStartDate && isDateStr(weekStartDate) ? weekStart(weekStartDate) : addDays(weekStart(today), -7);
  const metrics = await weekSummary(userId, ws);
  if (settings && !settings.weeklyReview) return { enabled: false as const, metrics };
  if (!refresh) {
    const cached = await db.aiInsight.findUnique({ where: { userId_kind_periodKey: { userId, kind: "weekly", periodKey: ws } } });
    if (cached) return { enabled: true as const, metrics, review: cached.content, cached: true, generatedAt: cached.createdAt };
  }
  await guardAi(userId, "weekly");
  const access = await aiAccess(userId);
  const filtered = (s: Record<string, unknown>) => Object.fromEntries(Object.entries(s).filter(([k]) => {
    const map: Record<string, string> = { avgKcal: "nutrition", avgProteinG: "nutrition", nutritionConsistency: "nutrition", avgWaterMl: "hydration", avgSteps: "activity", activityMin: "activity", distanceKm: "activity", avgSleepMin: "sleep", bedtimeVariabilityMin: "sleep", avgMood: "wellbeing", avgEnergy: "wellbeing", workouts: "workouts", totalVolumeKg: "workouts", daysLogged: "nutrition" };
    return map[k] ? access.has(map[k]) : false;
  }));
  const { data, refused } = await structured({
    schema: WeeklySchema,
    effort: "medium",
    maxTokens: 4000,
    system: "Task: write a supportive weekly review from the calculated metrics. Sections: what went well (2–4 bullets), trends vs the previous week (1–3), areas to improve based on the user's selected goals (1–3, practical and kind — no guilt), and 2–3 suggested priorities for next week. Missing data means not logged, not zero — don't criticise gaps. Each bullet max ~20 words. No medical claims.",
    content: JSON.stringify({ week: metrics.week, goals: metrics.goals, thisWeek: filtered(metrics.thisWeek), previousWeek: filtered(metrics.previousWeek), targets: access.has("profile") ? metrics.targets : null }),
  });
  if (refused || !data) return { enabled: true as const, metrics, review: null, refused: true };
  await db.aiInsight.upsert({ where: { userId_kind_periodKey: { userId, kind: "weekly", periodKey: ws } }, create: { userId, kind: "weekly", periodKey: ws, content: data }, update: { content: data, createdAt: new Date() } });
  return { enabled: true as const, metrics, review: data, cached: false, generatedAt: new Date() };
}
