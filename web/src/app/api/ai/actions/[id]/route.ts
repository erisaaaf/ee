import { z } from "zod";
import { authed, withAchievements } from "@/server/http";
import { resolvePendingAction } from "@/server/ai/chat";

export const POST = authed<{ id: string }>(async ({ user, params, body }) => {
  const { decision } = await body(z.object({ decision: z.enum(["confirm", "reject"]) }));
  return withAchievements(user.id, await resolvePendingAction(user.id, params.id, decision));
});
