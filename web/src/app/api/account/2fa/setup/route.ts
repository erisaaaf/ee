import { authed } from "@/server/http";
import { beginTotpSetup } from "@/server/services/auth";

export const POST = authed(async ({ user }) => beginTotpSetup(user.id), { rateLimit: { name: "2fa-setup", limit: 10, windowSec: 3600 } });
