import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "../db";
import { addDays, isDateStr, weekStart } from "@/lib/dates";
import { asStrings, getMe } from "../services/profile";
import { todayNutritionForAi, progressSeries, weekSummary } from "../services/analytics";
import { searchFoods } from "../services/food";
import { listSessions, generateForUser, getExercise, generateSchema } from "../services/fitness";
import { listActivities } from "../services/activity";
import { listGoals } from "../services/goals";
import { sleepRange, wellbeingRange, waterRange } from "../services/wellness";
import { MEAL_TYPES } from "@/lib/nutrition";

// Controlled data-access layer for the AI (scope §64–65).
//  * Read tools return compact, structured summaries — only for categories the user has authorised.
//  * Write tools never modify data: they create a PendingAction the user must confirm in the UI.

export type ToolCtx = { userId: string; today: string; access: Set<string> };

const denied = (cat: string) => ({ error: `access_denied`, message: `The user hasn't allowed the AI to read their ${cat} data. They can enable it in Privacy settings.` });
const days = z.number().int().min(1).max(90);

type ToolDef = {
  tool: Anthropic.Beta.BetaTool;
  input: z.ZodType;
  run: (ctx: ToolCtx, input: never) => Promise<unknown>;
};

function def<S extends z.ZodType>(name: string, description: string, input: S, schema: Record<string, unknown>, run: (ctx: ToolCtx, input: z.infer<S>) => Promise<unknown>): ToolDef {
  return {
    tool: { name, description, strict: true, input_schema: { type: "object", additionalProperties: false, ...schema } as Anthropic.Beta.BetaTool.InputSchema },
    input,
    run: run as ToolDef["run"],
  };
}

// Explicit whitelist: which privacy category each summary metric belongs to.
const SUMMARY_CATEGORY: Record<string, string> = {
  avgKcal: "nutrition",
  avgProteinG: "nutrition",
  avgCarbsG: "nutrition",
  avgFatG: "nutrition",
  avgFiberG: "nutrition",
  nutritionConsistency: "nutrition",
  avgWaterMl: "hydration",
  avgSteps: "activity",
  activityMin: "activity",
  distanceKm: "activity",
  sportBreakdown: "activity",
  avgSleepMin: "sleep",
  bedtimeVariabilityMin: "sleep",
  avgMood: "wellbeing",
  avgEnergy: "wellbeing",
  workouts: "workouts",
  totalVolumeKg: "workouts",
};

const daysProp = { days: { type: "integer", description: "Number of past days including today (1–90)." } };

export const TOOLS: ToolDef[] = [
  def("get_profile_context", "The user's goals, dietary pattern, allergies, dislikes, equipment, experience, schedule notes, reported limitations and daily targets (targets are estimates unless marked custom).", z.object({}), { properties: {}, required: [] }, async (ctx) => {
    if (!ctx.access.has("profile")) return denied("profile");
    const me = await getMe(ctx.userId);
    return {
      name: me.name,
      ageGroup: me.profile.birthYear ? (me.profile.isMinor ? "under 18" : "adult") : "unknown",
      units: me.profile.units,
      experience: me.profile.experience,
      goals: me.preferences.goals,
      diet: me.preferences.dietPattern,
      allergies: me.preferences.allergies,
      dislikes: me.preferences.dislikes,
      likes: me.preferences.likes,
      cuisines: me.preferences.cuisines,
      budget: me.preferences.budget,
      cookingTimeMin: me.preferences.cookingTimeMin,
      cookingSkill: me.preferences.cookingSkill,
      gymAccess: me.preferences.gymAccess,
      equipment: me.preferences.equipment,
      workoutDaysPerWeek: me.preferences.workoutDaysPerWeek,
      workoutDurationMin: me.preferences.workoutDurationMin,
      preferredSports: me.preferences.preferredSports,
      reportedLimitations: me.preferences.limitations,
      travelMode: me.preferences.travelMode,
      targets: { ...me.targets, note: me.targets.targetsSource === "calculated" ? "Estimated targets" : "Set by the user" },
    };
  }),
  def("get_nutrition_day", "Food diary for one day: items per meal and totals. Entries flagged estimate=true are estimates (e.g. from photos).", z.object({ date: z.string().nullable() }), { properties: { date: { type: ["string", "null"], description: "YYYY-MM-DD, or null for today." } }, required: ["date"] }, async (ctx, i) => {
    if (!ctx.access.has("nutrition")) return denied("nutrition");
    const date = i.date && isDateStr(i.date) ? i.date : ctx.today;
    return todayNutritionForAi(ctx.userId, date);
  }),
  def("get_trends", "Per-day series and averages for the last N days (nutrition, water, steps, sleep, mood/energy, workouts, activity). Days with no records are null — not zero.", z.object({ days }), { properties: daysProp, required: ["days"] }, async (ctx, i) => {
    const s = await progressSeries(ctx.userId, addDays(ctx.today, -(i.days - 1)), ctx.today);
    const allow = (cat: string, keys: string[]) => (ctx.access.has(cat) ? keys : []);
    const keys = ["date", ...allow("nutrition", ["kcal", "proteinG", "carbsG", "fatG", "fiberG"]), ...allow("hydration", ["waterMl"]), ...allow("activity", ["steps", "activityMin", "distanceKm"]), ...allow("sleep", ["sleepMin", "sleepQuality"]), ...allow("wellbeing", ["mood", "energy", "stress"]), ...allow("workouts", ["workouts", "volumeKg"])];
    return {
      days: s.days.map((d) => Object.fromEntries(keys.map((k) => [k, (d as Record<string, unknown>)[k]]))),
      averages: Object.fromEntries(
        Object.entries(s.summary).filter(([k]) => {
          const cat = SUMMARY_CATEGORY[k];
          return cat !== undefined && ctx.access.has(cat);
        }),
      ),
      notAuthorised: ["nutrition", "hydration", "activity", "sleep", "wellbeing", "workouts"].filter((c) => !ctx.access.has(c)),
    };
  }),
  def("get_week_review_data", "Calculated metrics for this week vs the previous week, plus the user's goals and targets.", z.object({}), { properties: {}, required: [] }, async (ctx) => {
    const w = await weekSummary(ctx.userId, weekStart(ctx.today));
    const allowed = (summary: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(summary).filter(([k]) => SUMMARY_CATEGORY[k] !== undefined && ctx.access.has(SUMMARY_CATEGORY[k])));
    return {
      week: w.week,
      goals: ctx.access.has("goals") || ctx.access.has("profile") ? w.goals : [],
      targets: ctx.access.has("profile") ? w.targets : null,
      thisWeek: allowed(w.thisWeek),
      previousWeek: allowed(w.previousWeek),
      notAuthorised: ["nutrition", "hydration", "activity", "sleep", "wellbeing", "workouts"].filter((c) => !ctx.access.has(c)),
    };
  }),
  def("get_workout_history", "Recent workouts (name, date, duration, sets, volume).", z.object({ days }), { properties: daysProp, required: ["days"] }, async (ctx, i) => {
    if (!ctx.access.has("workouts")) return denied("workouts");
    return listSessions(ctx.userId, { start: addDays(ctx.today, -(i.days - 1)), end: ctx.today, limit: 40 });
  }),
  def("get_activities", "Recent sports/activities with duration and distance.", z.object({ days }), { properties: daysProp, required: ["days"] }, async (ctx, i) => {
    if (!ctx.access.has("activity")) return denied("activity");
    const a = await listActivities(ctx.userId, { start: addDays(ctx.today, -(i.days - 1)), end: ctx.today, limit: 50 });
    return a.map((x) => ({ date: x.date, type: x.type, customName: x.customName, durationMin: x.durationMin, distanceM: x.distanceM, intensity: x.intensity, source: x.source }));
  }),
  def("get_sleep_and_wellbeing", "Sleep entries and optional mood/energy/stress check-ins for recent days.", z.object({ days }), { properties: daysProp, required: ["days"] }, async (ctx, i) => {
    const start = addDays(ctx.today, -(i.days - 1));
    return {
      sleep: ctx.access.has("sleep") ? (await sleepRange(ctx.userId, start, ctx.today)).map((s) => (s.logged ? { date: s.date, durationMin: s.durationMin, quality: s.quality, source: s.source } : { date: s.date, logged: false })) : denied("sleep"),
      wellbeing: ctx.access.has("wellbeing") ? (await wellbeingRange(ctx.userId, start, ctx.today)).map(({ notes: _n, ...w }) => (void _n, w)) : denied("wellbeing"),
    };
  }),
  def("get_hydration", "Daily water totals for recent days.", z.object({ days }), { properties: daysProp, required: ["days"] }, async (ctx, i) => {
    if (!ctx.access.has("hydration")) return denied("hydration");
    return waterRange(ctx.userId, addDays(ctx.today, -(i.days - 1)), ctx.today);
  }),
  def("get_goals", "The user's active goals with current progress.", z.object({}), { properties: {}, required: [] }, async (ctx) => {
    if (!ctx.access.has("goals")) return denied("goals");
    return (await listGoals(ctx.userId, ctx.today)).map((g) => ({ title: g.title, type: g.type, target: g.target, unit: g.unit, progress: g.label, percent: g.percent, status: g.status }));
  }),
  def("search_foods", "Search the food database. Returns foods with per-100 g nutrition and a data-quality label (reference, label, estimate, user). Use food ids from here when proposing to log food.", z.object({ query: z.string().min(1).max(80) }), { properties: { query: { type: "string" } }, required: ["query"] }, async (ctx, i) => {
    const foods = await searchFoods(ctx.userId, i.query, 8);
    return foods.map((f) => ({ foodId: f.id, name: f.name, brand: f.brand, dataQuality: f.dataQuality, per100: { kcal: f.per100.kcal, proteinG: f.per100.proteinG, carbsG: f.per100.carbsG, fatG: f.per100.fatG, fiberG: f.per100.fiberG }, servings: f.servings.slice(0, 3) }));
  }),
  def("find_exercise_alternatives", "Details, instructions and substitutes for an exercise (by slug or name), considering the user's equipment.", z.object({ exercise: z.string().min(1).max(80) }), { properties: { exercise: { type: "string", description: "Exercise slug or name, e.g. 'dumbbell-row' or 'push-up'." } }, required: ["exercise"] }, async (ctx, i) => {
    const slug = i.exercise.toLowerCase().trim().replace(/\s+/g, "-");
    const ex = await db.exercise.findFirst({ where: { OR: [{ slug }, { name: { contains: i.exercise } }], AND: [{ OR: [{ ownerId: null }, { ownerId: ctx.userId }] }] } });
    if (!ex) return { error: "not_found", message: "No exercise with that name in the library." };
    const d = await getExercise(ctx.userId, ex.slug);
    return { name: d.name, slug: d.slug, equipment: d.equipment, muscles: d.muscleGroups, instructions: d.instructions, commonMistakes: d.commonMistakes, alternatives: d.alternativesResolved, substitutesForUsersEquipment: d.substitutesForMyEquipment, homeVersion: d.homeVersion };
  }),
  def(
    "generate_workout",
    "Generate a safe, structured workout from the exercise library using rules (time, location, goal, focus, level, low impact, areas to avoid). Returns a plan; it is NOT saved.",
    z.object({ minutes: z.number(), location: z.enum(["home", "gym"]), goal: z.enum(["strength", "endurance", "general", "mobility"]), focus: z.enum(["full", "upper", "lower", "core", "cardio", "mobility"]), lowImpact: z.boolean(), avoidAreas: z.array(z.string()) }),
    {
      properties: {
        minutes: { type: "integer", description: "10–120" },
        location: { type: "string", enum: ["home", "gym"] },
        goal: { type: "string", enum: ["strength", "endurance", "general", "mobility"] },
        focus: { type: "string", enum: ["full", "upper", "lower", "core", "cardio", "mobility"] },
        lowImpact: { type: "boolean" },
        avoidAreas: { type: "array", items: { type: "string", enum: ["knees", "shoulders", "lower back", "wrists", "hips"] } },
      },
      required: ["minutes", "location", "goal", "focus", "lowImpact", "avoidAreas"],
    },
    async (ctx, i) => {
      const input = generateSchema.parse({ ...i, minutes: Math.min(120, Math.max(10, Math.round(i.minutes))) });
      const p = await generateForUser(ctx.userId, input);
      return { name: p.name, estMinutes: p.estMinutes, notes: p.notes, items: p.items.map((x) => ({ slug: x.slug, name: x.name, block: x.block, sets: x.sets, reps: x.reps, durationSec: x.durationSec, restSec: x.restSec })) };
    },
  ),
  // ── Proposals (require user confirmation) ──
  def("propose_log_water", "Propose logging a drink of water. The user must confirm in the app before anything is saved.", z.object({ amountMl: z.number(), date: z.string().nullable() }), { properties: { amountMl: { type: "integer" }, date: { type: ["string", "null"] } }, required: ["amountMl", "date"] }, async (ctx, i) => {
    const amountMl = Math.round(i.amountMl);
    if (amountMl < 10 || amountMl > 3000) return { error: "invalid_amount", message: "Amount must be between 10 and 3000 ml." };
    const date = i.date && isDateStr(i.date) ? i.date : ctx.today;
    return propose(ctx, "log_water", { amountMl, date }, `Log ${amountMl} ml of water on ${date}`);
  }),
  def(
    "propose_log_food",
    "Propose adding a food (from search_foods) to the diary. The user must confirm before it is saved.",
    z.object({ foodId: z.string(), grams: z.number(), mealType: z.enum(MEAL_TYPES), date: z.string().nullable() }),
    { properties: { foodId: { type: "string" }, grams: { type: "number" }, mealType: { type: "string", enum: [...MEAL_TYPES] }, date: { type: ["string", "null"] } }, required: ["foodId", "grams", "mealType", "date"] },
    async (ctx, i) => {
      const food = await db.food.findFirst({ where: { id: i.foodId, deletedAt: null, OR: [{ ownerId: null }, { ownerId: ctx.userId }] } });
      if (!food) return { error: "unknown_food", message: "Use a foodId returned by search_foods." };
      if (i.grams <= 0 || i.grams > 3000) return { error: "invalid_amount", message: "Grams must be between 1 and 3000." };
      const date = i.date && isDateStr(i.date) ? i.date : ctx.today;
      return propose(ctx, "log_food", { foodId: food.id, grams: Math.round(i.grams), mealType: i.mealType, date }, `Log ${Math.round(i.grams)} g of ${food.name} to ${i.mealType} on ${date}`);
    },
  ),
  def(
    "propose_create_recipe",
    "Propose saving a recipe to the user's recipe book. Ingredients may include foodId from search_foods so nutrition can be calculated. The user must confirm.",
    z.object({ name: z.string(), servings: z.number(), instructions: z.string(), prepMinutes: z.number().nullable(), ingredients: z.array(z.object({ name: z.string(), grams: z.number(), foodId: z.string().nullable() })) }),
    {
      properties: {
        name: { type: "string" },
        servings: { type: "number" },
        instructions: { type: "string" },
        prepMinutes: { type: ["integer", "null"] },
        ingredients: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, grams: { type: "number" }, foodId: { type: ["string", "null"] } }, required: ["name", "grams", "foodId"] } },
      },
      required: ["name", "servings", "instructions", "prepMinutes", "ingredients"],
    },
    async (ctx, i) => {
      if (!i.ingredients.length || i.ingredients.length > 40) return { error: "invalid", message: "1–40 ingredients required." };
      return propose(ctx, "create_recipe", i, `Save recipe "${i.name.slice(0, 60)}" (${i.ingredients.length} ingredients, ${i.servings} servings)`);
    },
  ),
  def(
    "propose_save_workout",
    "Propose saving a workout plan (exercise slugs from the library) to the user's plans. The user must confirm.",
    z.object({ name: z.string(), location: z.enum(["home", "gym", "any"]), items: z.array(z.object({ slug: z.string(), sets: z.number(), reps: z.number().nullable(), durationSec: z.number().nullable(), restSec: z.number() })) }),
    {
      properties: {
        name: { type: "string" },
        location: { type: "string", enum: ["home", "gym", "any"] },
        items: { type: "array", items: { type: "object", additionalProperties: false, properties: { slug: { type: "string" }, sets: { type: "integer" }, reps: { type: ["integer", "null"] }, durationSec: { type: ["integer", "null"] }, restSec: { type: "integer" } }, required: ["slug", "sets", "reps", "durationSec", "restSec"] } },
      },
      required: ["name", "location", "items"],
    },
    async (ctx, i) => {
      const exs = await db.exercise.findMany({ where: { slug: { in: i.items.map((x) => x.slug) } }, select: { slug: true } });
      const unknown = i.items.filter((x) => !exs.some((e) => e.slug === x.slug)).map((x) => x.slug);
      if (unknown.length) return { error: "unknown_exercises", message: `Not in the library: ${unknown.join(", ")}. Use generate_workout or find_exercise_alternatives to get valid slugs.` };
      if (i.items.some((x) => x.sets < 1 || x.sets > 6)) return { error: "unsafe_volume", message: "Use 1–6 sets per exercise." };
      return propose(ctx, "save_workout", i, `Save workout plan "${i.name.slice(0, 60)}" with ${i.items.length} exercises`);
    },
  ),
];

async function propose(ctx: ToolCtx, type: string, payload: object, summary: string) {
  const a = await db.pendingAction.create({
    data: { userId: ctx.userId, type, payload, summary, expiresAt: new Date(Date.now() + 30 * 60_000) },
  });
  return { status: "awaiting_user_confirmation", pendingActionId: a.id, summary, note: "Nothing has been saved yet. Tell the user they can confirm it with the button shown below your message." };
}

export async function runTool(ctx: ToolCtx, name: string, rawInput: unknown) {
  const t = TOOLS.find((x) => x.tool.name === name);
  if (!t) return { error: "unknown_tool" };
  const parsed = t.input.safeParse(rawInput);
  if (!parsed.success) return { error: "invalid_input", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  try {
    return await t.run(ctx, parsed.data as never);
  } catch (err) {
    return { error: "tool_failed", message: (err as Error).message.slice(0, 200) };
  }
}

export async function aiAccess(userId: string) {
  const s = await db.settings.findUnique({ where: { userId }, select: { aiDataAccess: true } });
  return new Set(asStrings(s?.aiDataAccess));
}
