import { authed } from "@/server/http";
import { deleteConversation, getConversation } from "@/server/ai/chat";

export const GET = authed<{ id: string }>(async ({ user, params }) => getConversation(user.id, params.id));
export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteConversation(user.id, params.id));
