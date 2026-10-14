import { authed } from "@/server/http";
import { targetsSchema } from "@/lib/validation";
import { getMe, updateTargets } from "@/server/services/profile";

export const PATCH = authed(async ({ user, body }) => {
  await updateTargets(user.id, await body(targetsSchema));
  return getMe(user.id);
});
