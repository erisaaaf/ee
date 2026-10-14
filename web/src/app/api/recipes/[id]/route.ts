import { authed } from "@/server/http";
import { deleteRecipe, recipeSchema, recipeWithNutrition, updateRecipe } from "@/server/services/recipes";

export const GET = authed<{ id: string }>(async ({ user, params }) => recipeWithNutrition(user.id, params.id));
export const PUT = authed<{ id: string }>(async ({ user, params, body }) => updateRecipe(user.id, params.id, await body(recipeSchema)));
export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteRecipe(user.id, params.id));
