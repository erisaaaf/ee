import { z } from "zod";
import { authed, zDate } from "@/server/http";
import { listSavedMeals, saveMealFromDiary } from "@/server/services/diary";
import { MEAL_TYPES } from "@/lib/nutrition";

export const GET = authed(async ({ user }) => listSavedMeals(user.id));
export const POST = authed(async ({ user, body }) => {
  const { date, mealType, name } = await body(z.object({ date: zDate, mealType: z.enum(MEAL_TYPES), name: z.string().trim().min(1).max(80) }));
  return saveMealFromDiary(user.id, date, mealType, name);
});
