import { authed } from "@/server/http";
import { deleteSavedMeal } from "@/server/services/diary";

export const DELETE = authed<{ id: string }>(async ({ user, params }) => deleteSavedMeal(user.id, params.id));
