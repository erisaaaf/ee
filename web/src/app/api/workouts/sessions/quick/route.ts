import { authed, withAchievements } from "@/server/http";
import { quickLogSchema, quickLogSession } from "@/server/services/fitness";

export const POST = authed(async ({ user, body }) => withAchievements(user.id, await quickLogSession(user.id, await body(quickLogSchema))));
