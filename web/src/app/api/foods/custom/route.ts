import { authed } from "@/server/http";
import { customFoodSchema } from "@/lib/validation";
import { createCustomFood, listCustomFoods } from "@/server/services/food";

export const GET = authed(async ({ user }) => listCustomFoods(user.id));
export const POST = authed(async ({ user, body }) => createCustomFood(user.id, await body(customFoodSchema)));
