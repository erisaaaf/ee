import { z } from "zod";
import { authed, withAchievements } from "@/server/http";
import { createRecipe, listRecipes, recipeSchema } from "@/server/services/recipes";

export const GET = authed(async ({ user, query }) => listRecipes(user.id, query(z.object({ q: z.string().max(100).optional() })).q));
export const POST = authed(async ({ user, body }) => withAchievements(user.id, await createRecipe(user.id, await body(recipeSchema))));
