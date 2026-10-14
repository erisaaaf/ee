import { authed } from "@/server/http";
import { createGoal, goalSchema, listGoals } from "@/server/services/goals";

export const GET = authed(async ({ user, today }) => listGoals(user.id, await today()));
export const POST = authed(async ({ user, body }) => createGoal(user.id, await body(goalSchema)));
