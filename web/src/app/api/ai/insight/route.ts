import { z } from "zod";
import { authed } from "@/server/http";
import { dailyInsight } from "@/server/ai/features";

export const GET = authed(async ({ user, query }) => dailyInsight(user.id, query(z.object({ refresh: z.enum(["1"]).optional() })).refresh === "1"));
