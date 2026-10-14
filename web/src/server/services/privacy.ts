import "server-only";
import { db } from "../db";
import { decryptOptional, verifyPassword } from "../crypto";
import { badRequest } from "../errors";
import { audit } from "../audit";

export const DATA_CATEGORIES = {
  nutrition: {
    label: "Nutrition",
    what: "Food diary entries, saved meals, custom foods, recipes, meal plans and grocery lists.",
    why: "To show your daily totals, trends and personalised meal suggestions.",
  },
  hydration: { label: "Hydration", what: "Water and drink entries.", why: "To track your hydration against your daily target." },
  workouts: {
    label: "Workouts",
    what: "Workout plans, completed sessions, sets, reps and weights, custom exercises.",
    why: "To track progress, personal records and suggest workouts.",
  },
  activity: {
    label: "Sports & activity",
    what: "Sports sessions, steps, distances and, only if you used live tracking, GPS routes.",
    why: "To show activity history and trends.",
  },
  sleep: { label: "Sleep", what: "Bedtime, wake time, duration and your quality rating.", why: "To show sleep consistency and trends." },
  wellbeing: {
    label: "Wellbeing",
    what: "Optional mood, energy, stress and recovery check-ins and private notes (encrypted).",
    why: "To show trends you choose to track. Never required.",
  },
  body: { label: "Body measurements", what: "Optional weight and waist measurements.", why: "For body-composition goals if you chose one." },
  goals: { label: "Goals & rewards", what: "Goals, challenges and earned achievements.", why: "To show progress and celebrate consistency." },
  ai: {
    label: "AI data",
    what: "Saved AI conversations (encrypted), generated insights and pending AI suggestions.",
    why: "So you can revisit conversations. You can turn saving off.",
  },
  devices: { label: "Connected devices", what: "Which integrations you connected and the categories you allowed.", why: "To import data you chose to share." },
} as const;
export type DataCategory = keyof typeof DATA_CATEGORIES;

export async function dataInventory(userId: string) {
  const [
    foodLogs,
    savedMeals,
    foods,
    recipes,
    mealPlans,
    water,
    sessions,
    templates,
    activities,
    metrics,
    sleep,
    wellbeing,
    body,
    goals,
    achievements,
    conversations,
    devices,
  ] = await Promise.all([
    db.foodLogEntry.count({ where: { userId } }),
    db.savedMeal.count({ where: { userId } }),
    db.food.count({ where: { ownerId: userId, deletedAt: null } }),
    db.recipe.count({ where: { userId } }),
    db.mealPlan.count({ where: { userId } }),
    db.waterEntry.count({ where: { userId } }),
    db.workoutSession.count({ where: { userId } }),
    db.workoutTemplate.count({ where: { userId } }),
    db.activity.count({ where: { userId } }),
    db.dailyMetric.count({ where: { userId } }),
    db.sleepEntry.count({ where: { userId } }),
    db.wellbeingEntry.count({ where: { userId } }),
    db.bodyMeasurement.count({ where: { userId } }),
    db.goal.count({ where: { userId } }),
    db.achievement.count({ where: { userId } }),
    db.aiConversation.count({ where: { userId } }),
    db.deviceConnection.count({ where: { userId, status: "connected" } }),
  ]);
  const counts: Record<DataCategory, number> = {
    nutrition: foodLogs + savedMeals + foods + recipes + mealPlans,
    hydration: water,
    workouts: sessions + templates,
    activity: activities + metrics,
    sleep,
    wellbeing,
    body,
    goals: goals + achievements,
    ai: conversations,
    devices,
  };
  return (Object.keys(DATA_CATEGORIES) as DataCategory[]).map((key) => ({ key, ...DATA_CATEGORIES[key], records: counts[key] }));
}

export async function exportData(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      profile: true,
      preferences: true,
      settings: true,
      foods: { include: { servings: true } },
      foodLogs: true,
      savedMeals: true,
      favorites: true,
      recipes: { include: { ingredients: true } },
      mealPlans: { include: { items: true } },
      groceryLists: { include: { items: true } },
      waterEntries: true,
      exercises: true,
      workoutTemplates: { include: { items: true } },
      workoutSessions: { include: { sets: true } },
      activities: true,
      dailyMetrics: true,
      sleepEntries: true,
      wellbeing: true,
      measurements: true,
      goals: true,
      challenges: true,
      achievements: true,
      devices: true,
      conversations: { include: { messages: true } },
      insights: true,
    },
  });
  // Strip secrets and decrypt the user's own encrypted fields.
  const { passwordHash: _p, totpSecretEnc: _t, failedLogins: _f, lockedUntil: _l, preferences, sleepEntries, wellbeing, devices, conversations, ...rest } = user;
  await audit(userId, "data.export");
  return {
    exportedAt: new Date().toISOString(),
    format: "vitality-export-v1",
    ...rest,
    preferences: preferences && { ...preferences, limitationsEnc: undefined, limitations: decryptOptional(preferences.limitationsEnc) },
    sleepEntries: sleepEntries.map(({ notesEnc, ...s }) => ({ ...s, notes: decryptOptional(notesEnc) })),
    wellbeing: wellbeing.map(({ notesEnc, ...w }) => ({ ...w, notes: decryptOptional(notesEnc) })),
    devices: devices.map(({ credentialsEnc: _c, ...d }) => d),
    conversations: conversations.map((c) => ({
      ...c,
      messages: c.messages.map(({ contentEnc, ...m }) => ({ ...m, content: decryptOptional(contentEnc) })),
    })),
  };
}

export async function deleteCategory(userId: string, category: DataCategory) {
  const w = { where: { userId } };
  switch (category) {
    case "nutrition":
      await db.$transaction([
        db.foodLogEntry.deleteMany(w),
        db.savedMeal.deleteMany(w),
        db.recipe.deleteMany(w),
        db.mealPlan.deleteMany(w),
        db.groceryList.deleteMany(w),
        db.food.deleteMany({ where: { ownerId: userId } }),
        db.favorite.deleteMany({ where: { userId, kind: { in: ["food", "meal", "recipe"] } } }),
      ]);
      break;
    case "hydration":
      await db.waterEntry.deleteMany(w);
      break;
    case "workouts":
      await db.$transaction([
        db.workoutSession.deleteMany(w),
        db.workoutTemplate.deleteMany(w),
        db.exercise.deleteMany({ where: { ownerId: userId } }),
        db.favorite.deleteMany({ where: { userId, kind: { in: ["exercise", "workout"] } } }),
      ]);
      break;
    case "activity":
      await db.$transaction([db.activity.deleteMany(w), db.dailyMetric.deleteMany(w), db.favorite.deleteMany({ where: { userId, kind: "sport" } })]);
      break;
    case "sleep":
      await db.sleepEntry.deleteMany(w);
      break;
    case "wellbeing":
      await db.wellbeingEntry.deleteMany(w);
      break;
    case "body":
      await db.bodyMeasurement.deleteMany(w);
      break;
    case "goals":
      await db.$transaction([db.goal.deleteMany(w), db.userChallenge.deleteMany(w), db.achievement.deleteMany(w)]);
      break;
    case "ai":
      await db.$transaction([db.aiConversation.deleteMany(w), db.aiInsight.deleteMany(w), db.pendingAction.deleteMany(w)]);
      break;
    case "devices":
      await db.deviceConnection.deleteMany(w);
      break;
  }
  await audit(userId, "data.delete_category", { category });
}

export async function deleteAccount(userId: string, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(password, user.passwordHash))) throw badRequest("Your password is incorrect.");
  // Cascading foreign keys remove every user-owned row (including audit logs and sessions).
  await db.user.delete({ where: { id: userId } });
  console.info("[account] account deleted"); // no identifiers retained in logs
}
