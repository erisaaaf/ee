import { authed } from "@/server/http";
import { deleteEntry, updateEntry, updateEntrySchema } from "@/server/services/diary";

export const PATCH = authed<{ id: string }>(async ({ user, params, body }) => updateEntry(user.id, params.id, await body(updateEntrySchema)));
export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteEntry(user.id, params.id));
