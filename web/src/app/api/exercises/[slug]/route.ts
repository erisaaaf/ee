import { authed } from "@/server/http";
import { getExercise } from "@/server/services/fitness";

export const GET = authed<{ slug: string }>(async ({ user, params }) => getExercise(user.id, params.slug));
