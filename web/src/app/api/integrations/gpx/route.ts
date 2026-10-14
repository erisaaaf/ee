import { z } from "zod";
import { authed, withAchievements } from "@/server/http";
import { importGpx } from "@/server/services/integrations";
import { SPORTS } from "@/lib/sports";

export const POST = authed(
  async ({ user, body }) => {
    const { gpx, type } = await body(z.object({ gpx: z.string().min(20).max(15_000_000), type: z.string().refine((t) => t in SPORTS).optional() }));
    return withAchievements(user.id, await importGpx(user.id, gpx, type));
  },
  { rateLimit: { name: "import-gpx", limit: 30, windowSec: 3600 } },
);
