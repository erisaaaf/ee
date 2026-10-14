import { z } from "zod";
import { authed } from "@/server/http";
import { lookupBarcode } from "@/server/services/food";

export const POST = authed(
  async ({ user, body }) => {
    const { code } = await body(z.object({ code: z.string().trim().min(1).max(2000) }));
    return lookupBarcode(user.id, code);
  },
  { rateLimit: { name: "barcode", limit: 60, windowSec: 60 } },
);
