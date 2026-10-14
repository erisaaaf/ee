import { z } from "zod";
import { authed, zDate } from "@/server/http";
import { copyMeal } from "@/server/services/diary";
import { MEAL_TYPES } from "@/lib/nutrition";

const ref = z.object({ date: zDate, mealType: z.enum(MEAL_TYPES) });

export const POST = authed(async ({ user, body }) => {
  const { from, to } = await body(z.object({ from: ref, to: ref }));
  return { copied: await copyMeal(user.id, from, to) };
});
