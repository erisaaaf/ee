import { z } from "zod";
import { authed } from "@/server/http";
import { dismissRecommendation } from "@/server/services/analytics";

export const POST = authed(async ({ user, body, today }) => {
  const { key } = await body(z.object({ key: z.string().min(1).max(60) }));
  await dismissRecommendation(user.id, key, await today());
  return { ok: true };
});
