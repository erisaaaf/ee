import { authed } from "@/server/http";
import { recentFoods } from "@/server/services/food";

export const GET = authed(async ({ user }) => recentFoods(user.id));
