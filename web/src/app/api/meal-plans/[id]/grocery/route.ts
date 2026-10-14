import { authed } from "@/server/http";
import { groceryListFromPlan } from "@/server/ai/features";

export const POST = authed<{ id: string }>(async ({ user, params }) => groceryListFromPlan(user.id, params.id));
