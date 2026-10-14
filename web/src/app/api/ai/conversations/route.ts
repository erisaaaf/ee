import { z } from "zod";
import { authed } from "@/server/http";
import { listConversations } from "@/server/ai/chat";

export const GET = authed(async ({ user, query }) => listConversations(user.id, query(z.object({ q: z.string().max(100).optional() })).q));
