import { authed, zRangeQuery } from "@/server/http";
import { measurementRange, measurementSchema, upsertMeasurement } from "@/server/services/wellness";

export const GET = authed(async ({ user, query }) => {
  const { start, end } = query(zRangeQuery);
  return measurementRange(user.id, start, end);
});
export const POST = authed(async ({ user, body }) => upsertMeasurement(user.id, await body(measurementSchema)));
