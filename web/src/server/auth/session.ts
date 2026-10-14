import "server-only";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";

export const SESSION_COOKIE = "vt_session";
export const SESSION_DAYS = 30;
const PENDING_2FA_MINUTES = 10;

export type AuthUser = { id: string; email: string; name: string | null; sessionId: string };

export async function createSession(userId: string, opts: { userAgent?: string | null; pending2fa?: boolean } = {}) {
  const token = randomToken();
  const ms = opts.pending2fa ? PENDING_2FA_MINUTES * 60_000 : SESSION_DAYS * 86_400_000;
  const expiresAt = new Date(Date.now() + ms);
  const session = await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      userAgent: opts.userAgent?.slice(0, 200) ?? null,
      expiresAt,
      pending2fa: opts.pending2fa ?? false,
    },
  });
  return { token, session, expiresAt };
}

/** Resolve a session token to a user. Returns null for unknown, expired or not-yet-2FA-verified sessions. */
export async function userFromToken(token: string | undefined, { allowPending2fa = false } = {}): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.pending2fa && !allowPending2fa) return null;

  // Sliding expiry: refresh at most once per hour.
  if (!session.pending2fa && Date.now() - session.lastSeenAt.getTime() > 3_600_000) {
    await db.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) },
      })
      .catch(() => {});
  }
  return { ...session.user, sessionId: session.id };
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
