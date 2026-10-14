import { authed } from "@/server/http";
import { settingsSchema } from "@/lib/validation";
import { getMe, updateSettings } from "@/server/services/profile";

export const PATCH = authed(async ({ user, body }) => {
  await updateSettings(user.id, await body(settingsSchema));
  return getMe(user.id);
});
