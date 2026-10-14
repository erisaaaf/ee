import { z } from "zod";
import { authed } from "@/server/http";
import { analyzeFoodPhoto } from "@/server/ai/features";

export const maxDuration = 120;
export const POST = authed(
  async ({ user, body }) => {
    const { image, hint } = await body(z.object({ image: z.string().max(7_500_000), hint: z.string().max(300).optional() }));
    return analyzeFoodPhoto(user.id, image, hint);
  },
  { rateLimit: { name: "ai-photo", limit: 10, windowSec: 600 } },
);
