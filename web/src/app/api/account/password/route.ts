import { z } from "zod";
import { authed } from "@/server/http";
import { passwordSchema } from "@/lib/validation";
import { changePassword } from "@/server/services/auth";

export const POST = authed(
  async ({ user, body }) => {
    const { currentPassword, newPassword } = await body(z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema }));
    await changePassword(user.id, user.sessionId, currentPassword, newPassword);
    return { ok: true };
  },
  { rateLimit: { name: "pwchange", limit: 10, windowSec: 3600 } },
);
