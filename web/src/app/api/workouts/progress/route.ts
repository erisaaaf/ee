import { authed } from "@/server/http";
import { trainedExercises } from "@/server/services/fitness";

export const GET = authed(async ({ user }) => trainedExercises(user.id));
