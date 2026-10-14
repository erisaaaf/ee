import { z } from "zod";
import { authed, zDate } from "@/server/http";
import { dayMicros } from "@/server/services/diary";

export const GET = authed(async ({ user, query, today }) => {
  const { date } = query(z.object({ date: zDate.optional() }));
  return dayMicros(user.id, date ?? (await today()));
});
