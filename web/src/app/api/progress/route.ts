import { authed, zRangeQuery } from "@/server/http";
import { badRequest } from "@/server/errors";
import { diffDays } from "@/lib/dates";
import { progressSeries } from "@/server/services/analytics";

export const GET = authed(async ({ user, query }) => {
  const { start, end } = query(zRangeQuery);
  if (diffDays(start, end) > 400) throw badRequest("Please choose a range of at most about a year.");
  return progressSeries(user.id, start, end);
});
