import { authed } from "@/server/http";
import { exerciseHistory } from "@/server/services/fitness";

export const GET = authed<{ exerciseId: string }>(async ({ user, params }) => exerciseHistory(user.id, params.exerciseId));
