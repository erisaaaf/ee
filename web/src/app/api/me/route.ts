import { authed } from "@/server/http";
import { getMe } from "@/server/services/profile";

export const GET = authed(async ({ user }) => getMe(user.id));
