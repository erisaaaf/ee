import { authed } from "@/server/http";
import { deleteGoal, goalUpdateSchema, updateGoal } from "@/server/services/goals";

export const PATCH = authed<{ id: string }>(async ({ user, params, body }) => updateGoal(user.id, params.id, await body(goalUpdateSchema)));
export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteGoal(user.id, params.id));
