import { authed } from "@/server/http";
import { db } from "@/server/db";
import { audit } from "@/server/audit";

export const GET = authed(async ({ user }) => {
  const sessions = await db.session.findMany({
    where: { userId: user.id, pending2fa: false, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true },
  });
  return sessions.map((s) => ({ ...s, current: s.id === user.sessionId }));
});

/** Sign out of all other devices. */
export const DELETE = authed(async ({ user }) => {
  const { count } = await db.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
  await audit(user.id, "session.revoke_others", { count });
  return { revoked: count };
});
