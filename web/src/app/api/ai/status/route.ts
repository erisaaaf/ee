import { authed } from "@/server/http";
import { aiStatus } from "@/server/ai/provider";

export const GET = authed(async ({ user }) => aiStatus(user.id));
