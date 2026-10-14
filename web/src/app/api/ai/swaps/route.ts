import { z } from "zod";
import { authed } from "@/server/http";
import { aiSwaps } from "@/server/ai/features";

export const POST = authed(async ({ user, body }) => {
  const { item, reason } = await body(z.object({ item: z.string().trim().min(1).max(100), reason: z.string().max(200).optional() }));
  return aiSwaps(user.id, item, reason);
});
