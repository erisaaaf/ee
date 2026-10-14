import { authed } from "@/server/http";
import { swapsForFood } from "@/server/services/swaps";

export const GET = authed<{ foodId: string }>(async ({ user, params }) => swapsForFood(user.id, params.foodId));
