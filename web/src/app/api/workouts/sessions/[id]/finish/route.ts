import { authed, withAchievements } from "@/server/http";
import { finishSchema, finishSession } from "@/server/services/fitness";

export const POST = authed<{ id: string }>(async ({ user, params, body }) =>
  withAchievements(user.id, await finishSession(user.id, params.id, await body(finishSchema))),
);
