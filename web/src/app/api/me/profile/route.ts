import { authed } from "@/server/http";
import { profileSchema } from "@/lib/validation";
import { getMe, updateProfile } from "@/server/services/profile";

export const PATCH = authed(async ({ user, body }) => {
  await updateProfile(user.id, await body(profileSchema));
  return getMe(user.id);
});
