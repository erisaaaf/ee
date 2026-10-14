import { z } from "zod";
import { authed } from "@/server/http";
import { globalSearch } from "@/server/services/search";

export const GET = authed(async ({ user, query }) => globalSearch(user.id, query(z.object({ q: z.string().max(100).default("") })).q));
