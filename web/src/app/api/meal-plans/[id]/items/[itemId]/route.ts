import { z } from "zod";
import { authed } from "@/server/http";
import { adjustMealServings, replaceMeal } from "@/server/ai/features";

export const maxDuration = 120;
/** Replace this meal (AI) without regenerating the whole plan. */
export const POST = authed<{ id: string; itemId: string }>(async ({ user, params, body }) => {
  const { instruction } = await body(z.object({ instruction: z.string().max(300).optional() }));
  return replaceMeal(user.id, params.id, params.itemId, instruction);
});
/** Change servings (no AI). */
export const PATCH = authed<{ id: string; itemId: string }>(async ({ user, params, body }) => {
  const { servings } = await body(z.object({ servings: z.number().int().min(1).max(12) }));
  return adjustMealServings(user.id, params.id, params.itemId, servings);
});
