import { authed } from "@/server/http";
import { duplicateRecipe } from "@/server/services/recipes";

export const POST = authed<{ id: string }>(async ({ user, params }) => duplicateRecipe(user.id, params.id));
