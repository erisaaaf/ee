import { z } from "zod";
import { authed } from "@/server/http";
import { searchFoods } from "@/server/services/food";

export const GET = authed(async ({ user, query }) => {
  const { q } = query(z.object({ q: z.string().max(100).default("") }));
  return searchFoods(user.id, q);
});
