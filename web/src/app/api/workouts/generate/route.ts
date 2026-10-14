import { authed } from "@/server/http";
import { generateForUser, generateSchema } from "@/server/services/fitness";

export const POST = authed(async ({ user, body }) => generateForUser(user.id, await body(generateSchema)));
