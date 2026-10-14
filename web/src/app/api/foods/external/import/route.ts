import { z } from "zod";
import { authed } from "@/server/http";
import { importExternal } from "@/server/services/food";

export const POST = authed(
  async ({ user, body }) => {
    const { provider, ref } = await body(z.object({ provider: z.enum(["openfoodfacts", "usda"]), ref: z.string().regex(/^\d{1,20}$/) }));
    return importExternal(user.id, provider, ref);
  },
  { rateLimit: { name: "food-import", limit: 30, windowSec: 60 } },
);
