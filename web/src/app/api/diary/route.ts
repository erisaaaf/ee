import { z } from "zod";
import { authed, withAchievements, zDate } from "@/server/http";
import { addEntry, addEntrySchema, dayDiary } from "@/server/services/diary";

export const GET = authed(async ({ user, query, today }) => {
  const { date } = query(z.object({ date: zDate.optional() }));
  return dayDiary(user.id, date ?? (await today()));
});

export const POST = authed(async ({ user, body }) => withAchievements(user.id, await addEntry(user.id, await body(addEntrySchema))));
