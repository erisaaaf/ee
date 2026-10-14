import { z } from "zod";
import { authed } from "@/server/http";
import { confirmTotpSetup } from "@/server/services/auth";

export const POST = authed(
  async ({ user, body }) => {
    const { code } = await body(z.object({ code: z.string().min(6).max(10) }));
    await confirmTotpSetup(user.id, code);
    return { ok: true };
  },
  { rateLimit: { name: "2fa-confirm", limit: 10, windowSec: 600 } },
);
