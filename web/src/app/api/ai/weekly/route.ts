import { z } from "zod";
import { authed } from "@/server/http";
import { weeklyReview } from "@/server/ai/features";

export const maxDuration = 120;
export const GET = authed(async ({ user, query }) => {
  const q = query(z.object({ week: z.string().optional(), refresh: z.enum(["1"]).optional() }));
  return weeklyReview(user.id, q.week, q.refresh === "1");
});
