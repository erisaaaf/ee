import { z } from "zod";
import { publicRoute } from "@/server/http";
import { emailSchema } from "@/lib/validation";
import { requestPasswordReset } from "@/server/services/auth";
import { emailConfigured } from "@/server/email";

export const POST = publicRoute(
  async ({ body }) => {
    const { email } = await body(z.object({ email: emailSchema }));
    await requestPasswordReset(email);
    // Same response whether or not the account exists.
    return { ok: true, emailConfigured: emailConfigured() };
  },
  { rateLimit: { name: "forgot", limit: 5, windowSec: 3600 } },
);
