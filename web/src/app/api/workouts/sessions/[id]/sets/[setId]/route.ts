import { authed } from "@/server/http";
import { deleteSet, setSchema, updateSet } from "@/server/services/fitness";

export const PATCH = authed<{ id: string; setId: string }>(async ({ user, params, body }) =>
  updateSet(user.id, params.id, params.setId, await body(setSchema.partial())),
);
export const DELETE = authed<{ id: string; setId: string }>(async ({ user, params }) => deleteSet(user.id, params.id, params.setId));
