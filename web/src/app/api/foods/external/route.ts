import { z } from "zod";
import { authed } from "@/server/http";
import { externalSearch } from "@/server/services/food";

// Open Food Facts allows ~10 searches/min, so this is rate-limited per user and only runs on explicit request.
export const GET = authed(
  async ({ query }) => {
    const { q } = query(z.object({ q: z.string().min(2).max(100) }));
    return externalSearch(q);
  },
  { rateLimit: { name: "food-external", limit: 8, windowSec: 60 } },
);
