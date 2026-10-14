import { authed } from "@/server/http";
import { evaluateAchievements, gamificationSummary } from "@/server/services/gamification";

export const GET = authed(async ({ user, today }) => {
  await evaluateAchievements(user.id);
  return gamificationSummary(user.id, await today());
});
