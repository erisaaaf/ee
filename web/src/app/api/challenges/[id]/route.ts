import { authed } from "@/server/http";
import { leaveChallenge } from "@/server/services/gamification";

export const DELETE = authed<{ id: string }>(async ({ user, params }) => leaveChallenge(user.id, params.id));
