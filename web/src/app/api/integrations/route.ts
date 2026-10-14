import { z } from "zod";
import { authed } from "@/server/http";
import { disconnect, listIntegrations, setConsent } from "@/server/services/integrations";

export const GET = authed(async ({ user }) => listIntegrations(user.id));
export const POST = authed(async ({ user, body }) => {
  const { provider, categories } = await body(z.object({ provider: z.string().max(40), categories: z.array(z.string().max(30)).max(10) }));
  await setConsent(user.id, provider, categories);
  return listIntegrations(user.id);
});
export const DELETE = authed(async ({ user, body }) => {
  const { provider, deleteImported } = await body(z.object({ provider: z.string().max(40), deleteImported: z.boolean().default(false) }));
  await disconnect(user.id, provider, deleteImported);
  return listIntegrations(user.id);
});
