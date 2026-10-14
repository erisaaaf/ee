import { authed } from "@/server/http";
import { customFoodSchema } from "@/lib/validation";
import { deleteCustomFood, updateCustomFood } from "@/server/services/food";

export const PUT = authed<{ id: string }>(async ({ user, params, body }) => updateCustomFood(user.id, params.id, await body(customFoodSchema)));
export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteCustomFood(user.id, params.id));
