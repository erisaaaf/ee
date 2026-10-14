import { authed } from "@/server/http";
import { generateMealPlan, listMealPlans, mealPlanRequestSchema } from "@/server/ai/features";

export const maxDuration = 300;
export const GET = authed(async ({ user }) => listMealPlans(user.id));
export const POST = authed(async ({ user, body }) => generateMealPlan(user.id, await body(mealPlanRequestSchema)), { rateLimit: { name: "ai-mealplan", limit: 5, windowSec: 600 } });
