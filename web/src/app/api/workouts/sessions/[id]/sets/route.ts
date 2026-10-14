import { authed } from "@/server/http";
import { addSet, setSchema } from "@/server/services/fitness";

export const POST = authed<{ id: string }>(async ({ user, params, body }) => addSet(user.id, params.id, await body(setSchema)));
