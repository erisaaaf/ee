import { authed } from "@/server/http";
import { deleteMealPlan, getMealPlan } from "@/server/ai/features";

export const GET = authed<{ id: string }>(async ({ user, params }) => getMealPlan(user.id, params.id));
export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteMealPlan(user.id, params.id));
