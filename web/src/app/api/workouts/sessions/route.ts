import { z } from "zod";
import { authed, zDate } from "@/server/http";
import { listSessions, startSession, startSessionSchema } from "@/server/services/fitness";

export const GET = authed(async ({ user, query }) => {
  const q = query(z.object({ start: zDate.optional(), end: zDate.optional(), limit: z.coerce.number().int().min(1).max(200).optional() }));
  return listSessions(user.id, q);
});
export const POST = authed(async ({ user, body }) => startSession(user.id, await body(startSessionSchema)));
