import { z } from "zod";
import { authed } from "@/server/http";
import { deleteWater, updateWater } from "@/server/services/wellness";

export const PATCH = authed<{ id: string }>(async ({ user, params, body }) => {
  const { amountMl } = await body(z.object({ amountMl: z.number().int().min(10).max(3000) }));
  await updateWater(user.id, params.id, amountMl);
  return { ok: true };
});
export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteWater(user.id, params.id));
