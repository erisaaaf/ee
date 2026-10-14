import { z } from "zod";
import { publicRoute } from "@/server/http";
import { passwordSchema } from "@/lib/validation";
import { resetPassword } from "@/server/services/auth";

export const POST = publicRoute(
  async ({ body }) => {
    const { token, password } = await body(z.object({ token: z.string().min(20).max(200), password: passwordSchema }));
    await resetPassword(token, password);
    return { ok: true };
  },
  { rateLimit: { name: "reset", limit: 10, windowSec: 3600 } },
);
