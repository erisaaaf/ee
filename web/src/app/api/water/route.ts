import { z } from "zod";
import { authed, withAchievements, zDate, zRangeQuery } from "@/server/http";
import { addWater, waterDay, waterRange, waterSchema } from "@/server/services/wellness";

export const GET = authed(async ({ user, query, today, req }) => {
  if (req.nextUrl.searchParams.has("start")) {
    const { start, end } = query(zRangeQuery);
    return waterRange(user.id, start, end);
  }
  const { date } = query(z.object({ date: zDate.optional() }));
  return waterDay(user.id, date ?? (await today()));
});

export const POST = authed(async ({ user, body }) => withAchievements(user.id, await addWater(user.id, await body(waterSchema))));
