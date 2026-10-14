import { authed } from "@/server/http";
import { getFood } from "@/server/services/food";

export const GET = authed<{ id: string }>(async ({ user, params }) => getFood(user.id, params.id));
