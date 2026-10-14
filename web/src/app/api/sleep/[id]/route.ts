import { authed } from "@/server/http";
import { deleteSleep } from "@/server/services/wellness";

export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteSleep(user.id, params.id));
