import { z } from "zod";
import { authed, withAchievements, zDate } from "@/server/http";
import { activitySchema, addActivity, listActivities } from "@/server/services/activity";

export const GET = authed(async ({ user, query }) => {
  const q = query(z.object({ start: zDate.optional(), end: zDate.optional(), type: z.string().max(30).optional(), limit: z.coerce.number().int().min(1).max(500).optional() }));
  return listActivities(user.id, q);
});
export const POST = authed(async ({ user, body }) => {
  const a = await addActivity(user.id, await body(activitySchema));
  return withAchievements(user.id, { ...a, route: undefined });
});
