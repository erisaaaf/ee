import { z } from "zod";
import { authed, withAchievements, zDate } from "@/server/http";
import { logSavedMeal } from "@/server/services/diary";
import { MEAL_TYPES } from "@/lib/nutrition";

export const POST = authed<{ id: string }>(async ({ user, params, body }) => {
  const { date, mealType } = await body(z.object({ date: zDate, mealType: z.enum(MEAL_TYPES) }));
  return withAchievements(user.id, { logged: await logSavedMeal(user.id, params.id, date, mealType) });
});
