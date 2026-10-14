import { authed } from "@/server/http";
import { chat, chatSchema } from "@/server/ai/chat";

export const maxDuration = 120;
export const POST = authed(async ({ user, body }) => chat(user.id, await body(chatSchema)), { rateLimit: { name: "ai-chat-burst", limit: 10, windowSec: 60 } });
