import { authed } from "@/server/http";
import { dashboard } from "@/server/services/analytics";

export const GET = authed(async ({ user }) => dashboard(user.id));
