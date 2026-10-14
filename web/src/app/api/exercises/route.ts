import { z } from "zod";
import { authed } from "@/server/http";
import { createCustomExercise, customExerciseSchema, listExercises } from "@/server/services/fitness";

const filters = z.object({
  q: z.string().max(100).optional(),
  category: z.string().max(30).optional(),
  muscle: z.string().max(30).optional(),
  equipment: z.string().max(30).optional(),
  difficulty: z.string().max(20).optional(),
  doable: z.enum(["true", "false"]).optional(),
  location: z.enum(["home", "gym"]).optional(),
});

export const GET = authed(async ({ user, query }) => {
  const f = query(filters);
  return listExercises(user.id, { ...f, doable: f.doable === "true" });
});
export const POST = authed(async ({ user, body }) => createCustomExercise(user.id, await body(customExerciseSchema)));
