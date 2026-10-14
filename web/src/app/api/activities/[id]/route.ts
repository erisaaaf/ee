import { authed } from "@/server/http";
import { deleteActivity, getActivity, updateActivity, updateActivitySchema } from "@/server/services/activity";

export const GET = authed<{ id: string }>(async ({ user, params }) => getActivity(user.id, params.id));
export const PATCH = authed<{ id: string }>(async ({ user, params, body }) => updateActivity(user.id, params.id, await body(updateActivitySchema)));
export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteActivity(user.id, params.id));
