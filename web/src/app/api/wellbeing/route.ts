import { z } from "zod";
import { authed, zDate, zRangeQuery } from "@/server/http";
import { deleteWellbeing, upsertWellbeing, wellbeingRange, wellbeingSchema } from "@/server/services/wellness";

export const GET = authed(async ({ user, query }) => {
  const { start, end } = query(zRangeQuery);
  return wellbeingRange(user.id, start, end);
});
export const POST = authed(async ({ user, body }) => {
  const row = await upsertWellbeing(user.id, await body(wellbeingSchema));
  return { id: row.id, date: row.date };
});
export const DELETE = authed(async ({ user, body }) => {
  const { date } = await body(z.object({ date: zDate }));
  await deleteWellbeing(user.id, date);
});
