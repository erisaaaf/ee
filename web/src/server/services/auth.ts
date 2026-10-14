import "server-only";
import QRCode from "qrcode";
import { db } from "../db";
import { decrypt, encrypt, hashPassword, randomToken, sha256, verifyPassword } from "../crypto";
import { badRequest, conflict, unauthorized, AppError } from "../errors";
import { audit } from "../audit";
import { createSession } from "../auth/session";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../auth/totp";
import { sendEmail } from "../email";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const RESET_TTL_MIN = 60;
const INVALID_LOGIN = "That email and password combination didn't work.";
let dummyHash: Promise<string> | undefined;

export async function registerUser(input: {
  email: string;
  password: string;
  name?: string;
  timezone?: string;
  language?: "en" | "sq" | "de";
}) {
  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw conflict("An account with this email already exists. Try signing in instead.");
  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name || null,
      profile: { create: { timezone: validTimezone(input.timezone), language: input.language ?? "en" } },
      preferences: { create: {} },
      settings: { create: {} },
    },
  });
  await audit(user.id, "account.register");
  return user;
}

function validTimezone(tz?: string) {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export async function loginUser(email: string, password: string, userAgent: string | null) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    // Equalise timing with the password check so account existence isn't revealed.
    dummyHash ??= hashPassword(randomToken());
    await verifyPassword(password, await dummyHash);
    throw unauthorized(INVALID_LOGIN);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, "locked", "Too many sign-in attempts. Please wait 15 minutes, or reset your password.");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await audit(user.id, failed >= MAX_FAILED ? "login.locked" : "login.failed");
    throw unauthorized(INVALID_LOGIN);
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  const session = await createSession(user.id, { userAgent, pending2fa: user.totpEnabled });
  await audit(user.id, user.totpEnabled ? "login.password_ok_2fa_pending" : "login.success");
  return { ...session, requires2fa: user.totpEnabled };
}

/** Exchange a pending-2FA session for a full session after a valid TOTP code. */
export async function completeTwoFactor(pendingTokenHash: string, code: string, userAgent: string | null) {
  const pending = await db.session.findUnique({ where: { tokenHash: pendingTokenHash }, include: { user: true } });
  if (!pending || !pending.pending2fa || pending.expiresAt < new Date()) {
    throw unauthorized("Your sign-in expired. Please enter your email and password again.");
  }
  const secret = pending.user.totpSecretEnc ? decrypt(pending.user.totpSecretEnc) : null;
  if (!secret || !verifyTotp(secret, code)) {
    await audit(pending.userId, "login.2fa_failed");
    throw unauthorized("That code didn't work. Check your authenticator app and try again.");
  }
  await db.session.delete({ where: { id: pending.id } });
  const session = await createSession(pending.userId, { userAgent });
  await audit(pending.userId, "login.success_2fa");
  return session;
}

export async function changePassword(userId: string, currentSessionId: string, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) throw badRequest("Your current password is incorrect.");
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  // Sign out everywhere else.
  await db.session.deleteMany({ where: { userId, id: { not: currentSessionId } } });
  await audit(userId, "password.change");
}

export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email } });
  // Always behave the same whether or not the account exists.
  if (!user) return;
  const token = randomToken();
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60_000) },
  });
  const base = process.env.APP_URL || "http://localhost:3000";
  await sendEmail(
    user.email,
    "Reset your Vitality password",
    `Someone (hopefully you) asked to reset your password.\n\nOpen this link within ${RESET_TTL_MIN} minutes:\n${base}/reset-password?token=${token}\n\nIf you didn't request this, you can ignore this email.`,
  );
  await audit(user.id, "password.reset_requested");
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest("This reset link is invalid or has expired. Please request a new one.");
  }
  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(newPassword), failedLogins: 0, lockedUntil: null },
    }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  await audit(record.userId, "password.reset_completed");
}

// ── Two-factor setup ──

export async function beginTotpSetup(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.totpEnabled) throw conflict("Two-factor authentication is already on.");
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: userId }, data: { totpSecretEnc: encrypt(secret) } });
  const uri = otpauthUri(secret, user.email);
  return { secret, uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

export async function confirmTotpSetup(userId: string, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpSecretEnc) throw badRequest("Start two-factor setup first.");
  if (!verifyTotp(decrypt(user.totpSecretEnc), code)) throw badRequest("That code didn't match. Try the newest code in your app.");
  await db.user.update({ where: { id: userId }, data: { totpEnabled: true } });
  await audit(userId, "2fa.enabled");
}

export async function disableTotp(userId: string, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(password, user.passwordHash))) throw badRequest("Your password is incorrect.");
  await db.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecretEnc: null } });
  await audit(userId, "2fa.disabled");
}
