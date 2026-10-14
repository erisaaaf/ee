import { z } from "zod";
import { authed } from "@/server/http";
import { joinChallenge, listChallenges } from "@/server/services/gamification";

export const GET = authed(async ({ user, today }) => listChallenges(user.id, await today()));
export const POST = authed(async ({ user, body, today }) => {
  const { key } = await body(z.object({ key: z.string().max(40) }));
  await joinChallenge(user.id, key, await today());
  return listChallenges(user.id, await today());
});
