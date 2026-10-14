import { z } from "zod";
import { authed } from "@/server/http";
import { disableTotp } from "@/server/services/auth";

export const POST = authed(
  async ({ user, body }) => {
    const { password } = await body(z.object({ password: z.string().min(1).max(200) }));
    await disableTotp(user.id, password);
    return { ok: true };
  },
  { rateLimit: { name: "2fa-disable", limit: 10, windowSec: 3600 } },
);
