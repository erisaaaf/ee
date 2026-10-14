import { authed } from "@/server/http";
import { completeOnboarding, getMe } from "@/server/services/profile";

export const POST = authed(async ({ user }) => {
  await completeOnboarding(user.id);
  return getMe(user.id);
});
