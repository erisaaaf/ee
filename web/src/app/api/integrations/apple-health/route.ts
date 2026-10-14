import { authed } from "@/server/http";
import { appleImportSchema, importAppleHealth } from "@/server/services/integrations";

export const POST = authed(async ({ user, body }) => importAppleHealth(user.id, await body(appleImportSchema)), { rateLimit: { name: "import-apple", limit: 10, windowSec: 3600 } });
