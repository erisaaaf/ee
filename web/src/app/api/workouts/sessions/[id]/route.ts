import { authed } from "@/server/http";
import { deleteSession, editSession, finishSchema, getSession } from "@/server/services/fitness";

export const GET = authed<{ id: string }>(async ({ user, params }) => getSession(user.id, params.id));
export const PATCH = authed<{ id: string }>(async ({ user, params, body }) => editSession(user.id, params.id, await body(finishSchema)));
export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteSession(user.id, params.id));
