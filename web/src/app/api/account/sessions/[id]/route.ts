import { authed } from "@/server/http";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";

export const DELETE = authed<{ id: string }>(async ({ user, params }) => {
  const { count } = await db.session.deleteMany({ where: { id: params.id, userId: user.id } });
  if (!count) throw notFound("session");
  await audit(user.id, "session.revoke");
  return { ok: true };
});
