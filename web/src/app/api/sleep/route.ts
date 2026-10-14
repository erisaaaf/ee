import { authed, withAchievements, zRangeQuery } from "@/server/http";
import { sleepRange, sleepSchema, upsertSleep } from "@/server/services/wellness";

export const GET = authed(async ({ user, query }) => {
  const { start, end } = query(zRangeQuery);
  return sleepRange(user.id, start, end);
});
export const POST = authed(async ({ user, body }) => {
  const row = await upsertSleep(user.id, await body(sleepSchema));
  return withAchievements(user.id, { id: row.id, durationMin: row.durationMin });
});
