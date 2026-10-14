import { authed } from "@/server/http";
import { createTemplate, listTemplates, templateSchema } from "@/server/services/fitness";

export const GET = authed(async ({ user }) => listTemplates(user.id));
export const POST = authed(async ({ user, body }) => createTemplate(user.id, await body(templateSchema)));
