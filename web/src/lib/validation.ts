// Zod schemas shared by client forms and server routes (the server ALWAYS re-validates).
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "That password is too long")
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), "Include at least one letter and one number")
  .refine((v) => !/^(.)\1+$/.test(v), "Avoid repeating a single character");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().max(80).optional(),
  timezone: z.string().max(64).optional(),
  language: z.enum(["en", "sq", "de"]).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});

export const GOAL_OPTIONS = [
  { key: "general_health", label: "Improve general health" },
  { key: "strength", label: "Build strength" },
  { key: "endurance", label: "Improve endurance" },
  { key: "sports_performance", label: "Improve sports performance" },
  { key: "habits", label: "Build consistent habits" },
  { key: "nutrition", label: "Improve nutrition" },
  { key: "hydration", label: "Improve hydration" },
  { key: "sleep", label: "Improve sleep" },
  { key: "maintain", label: "Maintain current lifestyle" },
  { key: "body_composition", label: "Body composition" },
] as const;
export const GOAL_KEYS = GOAL_OPTIONS.map((g) => g.key) as [string, ...string[]];

export const DIET_PATTERNS = [
  { key: "balanced", label: "Balanced" },
  { key: "vegetarian", label: "Vegetarian" },
  { key: "vegan", label: "Vegan" },
  { key: "mediterranean", label: "Mediterranean-style" },
  { key: "high_protein", label: "High-protein" },
  { key: "pescatarian", label: "Pescatarian" },
  { key: "halal", label: "Halal" },
  { key: "custom", label: "My own preferences" },
] as const;

export const ALLERGENS = [
  "gluten",
  "dairy",
  "eggs",
  "peanuts",
  "tree_nuts",
  "soy",
  "fish",
  "shellfish",
  "sesame",
  "lactose",
] as const;

export const EQUIPMENT = [
  { key: "dumbbells", label: "Dumbbells" },
  { key: "barbell", label: "Barbell" },
  { key: "kettlebell", label: "Kettlebell" },
  { key: "resistance_band", label: "Resistance bands" },
  { key: "pullup_bar", label: "Pull-up bar" },
  { key: "bench", label: "Bench" },
  { key: "cable_machine", label: "Cable machine" },
  { key: "machines", label: "Gym machines" },
  { key: "cardio_machine", label: "Cardio machine" },
  { key: "mat", label: "Exercise mat" },
] as const;

const stringList = z.array(z.string().trim().min(1).max(60)).max(40);
const optInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional();
const optNum = (min: number, max: number) => z.number().min(min).max(max).nullable().optional();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM").nullable().optional();

export const profileSchema = z.object({
  name: z.string().trim().max(80).nullable().optional(),
  birthYear: optInt(new Date().getFullYear() - 110, new Date().getFullYear() - 5),
  sex: z.enum(["female", "male", "other"]).nullable().optional(),
  heightCm: optNum(50, 260),
  weightKg: optNum(20, 400),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).nullable().optional(),
  experience: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(),
  units: z.enum(["metric", "imperial"]).optional(),
  country: z.string().trim().max(60).nullable().optional(),
  language: z.enum(["en", "sq", "de"]).optional(),
  timezone: z.string().max(64).optional(),
});

export const targetsSchema = z.object({
  calorieTarget: optInt(800, 6000),
  proteinTargetG: optInt(10, 400),
  carbTargetG: optInt(0, 900),
  fatTargetG: optInt(10, 300),
  fiberTargetG: optInt(5, 100),
  waterTargetMl: z.number().int().min(250).max(8000).optional(),
  stepTarget: optInt(500, 50000),
  sleepTargetMin: optInt(240, 720),
  workoutsPerWeek: optInt(0, 14),
  targetsSource: z.enum(["calculated", "custom"]).optional(),
});

export const preferencesSchema = z.object({
  goals: z.array(z.enum(GOAL_KEYS)).max(10).optional(),
  dietPattern: z.string().max(40).optional(),
  allergies: stringList.optional(),
  dislikes: stringList.optional(),
  likes: stringList.optional(),
  cuisines: stringList.optional(),
  cookingSkill: z.enum(["basic", "intermediate", "confident"]).nullable().optional(),
  mealsPerDay: optInt(1, 8),
  budget: z.enum(["low", "medium", "flexible"]).nullable().optional(),
  cookingTimeMin: optInt(5, 240),
  gymAccess: z.boolean().optional(),
  homeWorkouts: z.boolean().optional(),
  equipment: stringList.optional(),
  workoutDaysPerWeek: optInt(0, 7),
  workoutDurationMin: optInt(5, 240),
  trainingDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  preferredSports: stringList.optional(),
  bedtime: time,
  wakeTime: time,
  waterHabit: z.string().max(60).nullable().optional(),
  scheduleNotes: z.string().max(500).nullable().optional(),
  limitations: z.string().max(1000).nullable().optional(),
  travelMode: z.boolean().optional(),
});

export const AI_DATA_CATEGORIES = ["nutrition", "hydration", "workouts", "activity", "sleep", "wellbeing", "goals", "profile"] as const;
export const TRACKING_CATEGORIES = ["nutrition", "hydration", "workouts", "activity", "sleep", "wellbeing"] as const;
export const DASHBOARD_WIDGETS = ["calories", "protein", "water", "steps", "workout", "sports", "sleep", "mood", "goals", "insight"] as const;
export const REMINDER_TYPES = ["water", "workout", "log_meal", "prepare_meal", "sleep", "review_progress", "challenge"] as const;

export const settingsSchema = z.object({
  aiEnabled: z.boolean().optional(),
  aiDataAccess: z.array(z.enum(AI_DATA_CATEGORIES)).optional(),
  aiSaveConversations: z.boolean().optional(),
  dailyInsight: z.boolean().optional(),
  weeklyReview: z.boolean().optional(),
  gamification: z.boolean().optional(),
  notifications: z.boolean().optional(),
  reminders: z
    .array(z.object({ type: z.enum(REMINDER_TYPES), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), enabled: z.boolean() }))
    .max(20)
    .optional(),
  trackingCategories: z.array(z.enum(TRACKING_CATEGORIES)).optional(),
  dashboardWidgets: z.array(z.enum(DASHBOARD_WIDGETS)).optional(),
  showMicronutrients: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
});

const nutrientNum = z.number().min(0).max(100000).nullable().optional();
export const per100Schema = z.object({
  kcal: z.number().min(0).max(900).nullable().optional(),
  proteinG: z.number().min(0).max(100).nullable().optional(),
  carbsG: z.number().min(0).max(100).nullable().optional(),
  fatG: z.number().min(0).max(100).nullable().optional(),
  fiberG: z.number().min(0).max(100).nullable().optional(),
  sugarG: z.number().min(0).max(100).nullable().optional(),
  sodiumMg: nutrientNum,
  ironMg: nutrientNum,
  calciumMg: nutrientNum,
  potassiumMg: nutrientNum,
  magnesiumMg: nutrientNum,
  vitAUg: nutrientNum,
  vitCMg: nutrientNum,
  vitDUg: nutrientNum,
  vitB12Ug: nutrientNum,
  folateUg: nutrientNum,
});

export const customFoodSchema = per100Schema.extend({
  name: z.string().trim().min(1, "Enter a name").max(120),
  brand: z.string().trim().max(80).nullable().optional(),
  barcode: z
    .string()
    .trim()
    .regex(/^\d{6,14}$/, "Barcodes contain 6–14 digits")
    .nullable()
    .optional(),
  servingG: z.number().min(1).max(5000),
  servingLabel: z.string().trim().min(1).max(60),
  isLiquid: z.boolean().optional(),
  // Values can be entered per serving (as on most labels) or per 100 g.
  basis: z.enum(["per100", "perServing"]).default("perServing"),
});
