import { authed, zRangeQuery } from "@/server/http";
import { setManualSteps, stepsRange, stepsSchema } from "@/server/services/wellness";

export const GET = authed(async ({ user, query }) => {
  const { start, end } = query(zRangeQuery);
  return stepsRange(user.id, start, end);
});
export const PUT = authed(async ({ user, body }) => {
  const { date, steps } = await body(stepsSchema);
  return setManualSteps(user.id, date, steps);
});
