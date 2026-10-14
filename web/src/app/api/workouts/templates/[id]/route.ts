import { authed } from "@/server/http";
import { deleteTemplate, getTemplate, templateSchema, updateTemplate } from "@/server/services/fitness";

export const GET = authed<{ id: string }>(async ({ user, params }) => getTemplate(user.id, params.id));
export const PUT = authed<{ id: string }>(async ({ user, params, body }) => updateTemplate(user.id, params.id, await body(templateSchema)));
export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteTemplate(user.id, params.id));
