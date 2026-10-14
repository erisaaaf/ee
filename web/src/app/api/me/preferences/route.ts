import { authed } from "@/server/http";
import { preferencesSchema } from "@/lib/validation";
import { getMe, updatePreferences } from "@/server/services/profile";

export const PATCH = authed(async ({ user, body }) => {
  await updatePreferences(user.id, await body(preferencesSchema));
  return getMe(user.id);
});
