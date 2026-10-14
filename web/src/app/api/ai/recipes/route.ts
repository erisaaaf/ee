import { authed } from "@/server/http";
import { generateRecipeIdeas, recipeIdeasSchema } from "@/server/ai/features";

export const maxDuration = 120;
export const POST = authed(async ({ user, body }) => generateRecipeIdeas(user.id, await body(recipeIdeasSchema)));
