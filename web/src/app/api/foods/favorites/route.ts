import { authed } from "@/server/http";
import { favoriteFoods } from "@/server/services/food";

export const GET = authed(async ({ user }) => favoriteFoods(user.id));
