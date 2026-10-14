import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { sha256, decrypt } from "@/server/crypto";
import { changePassword, beginTotpSetup, completeTwoFactor, confirmTotpSetup, loginUser, registerUser, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { userFromToken } from "@/server/auth/session";
import { totpCode } from "@/server/auth/totp";
import { makeUser } from "./helpers";
import { AppError } from "@/server/errors";

describe("registration & login", () => {
  it("hashes passwords (never stores plaintext) and creates profile rows", async () => {
    const { user, password } = await makeUser();
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { profile: true, settings: true, preferences: true } });
    expect(row.passwordHash).not.toContain(password);
    expect(row.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(row.profile?.timezone).toBe("Europe/Tirane");
    expect(row.settings).not.toBeNull();
  });

  it("rejects duplicate emails", async () => {
    const { email } = await makeUser();
    await expect(registerUser({ email, password: "another pass 1" })).rejects.toMatchObject({ status: 409 });
  });

  it("logs in with correct credentials and returns a usable session token", async () => {
    const { email, password, user } = await makeUser();
    const res = await loginUser(email, password, "vitest");
    expect(res.requires2fa).toBe(false);
    const authed = await userFromToken(res.token);
    expect(authed?.id).toBe(user.id);
    // Only the hash of the token is stored.
    expect(await db.session.findFirst({ where: { tokenHash: res.token } })).toBeNull();
    expect(await db.session.findFirst({ where: { tokenHash: sha256(res.token) } })).not.toBeNull();
  });

  it("uses the same generic error for unknown email and wrong password", async () => {
    const { email } = await makeUser();
    const a = await loginUser("nobody@example.test", "whatever 123", null).catch((e: AppError) => e);
    const b = await loginUser(email, "wrong password 1", null).catch((e: AppError) => e);
    expect((a as AppError).message).toBe((b as AppError).message);
    expect((a as AppError).status).toBe(401);
  });

  it("locks the account after 5 failed attempts", async () => {
    const { email, password } = await makeUser();
    for (let i = 0; i < 5; i++) await loginUser(email, "nope nope 1", null).catch(() => {});
    await expect(loginUser(email, password, null)).rejects.toMatchObject({ status: 423 });
  });
});

describe("password change & reset", () => {
  it("changing the password signs out other sessions", async () => {
    const { email, password, user } = await makeUser();
    const s1 = await loginUser(email, password, "a");
    const s2 = await loginUser(email, password, "b");
    const current = await userFromToken(s1.token);
    await changePassword(user.id, current!.sessionId, password, "brand new pass 9");
    expect(await userFromToken(s1.token)).not.toBeNull();
    expect(await userFromToken(s2.token)).toBeNull();
    await expect(loginUser(email, "brand new pass 9", null)).resolves.toBeTruthy();
  });

  it("reset tokens are single-use and invalidate all sessions", async () => {
    const { email, password, user } = await makeUser();
    const s = await loginUser(email, password, null);
    // Capture the emailed link from the dev email log.
    const logs: string[] = [];
    const orig = console.info;
    console.info = (msg: string) => logs.push(String(msg));
    await requestPasswordReset(email);
    console.info = orig;
    const token = logs.join("\n").match(/token=([\w-]+)/)?.[1];
    expect(token).toBeTruthy();
    await resetPassword(token!, "reset pass 777x");
    expect(await userFromToken(s.token)).toBeNull();
    await expect(resetPassword(token!, "again pass 777x")).rejects.toMatchObject({ status: 400 });
    expect((await db.passwordResetToken.findFirst({ where: { userId: user.id } }))?.usedAt).not.toBeNull();
  });
});

describe("two-factor authentication", () => {
  it("requires a valid TOTP code after password when enabled", async () => {
    const { email, password, user } = await makeUser();
    const setup = await beginTotpSetup(user.id);
    expect(setup.uri).toContain("otpauth://totp/");
    // Secret is encrypted at rest.
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.totpSecretEnc).not.toContain(setup.secret);
    expect(decrypt(row.totpSecretEnc!)).toBe(setup.secret);
    await confirmTotpSetup(user.id, totpCode(setup.secret));

    const pending = await loginUser(email, password, null);
    expect(pending.requires2fa).toBe(true);
    // The pending session cannot be used as a normal session.
    expect(await userFromToken(pending.token)).toBeNull();
    await expect(completeTwoFactor(sha256(pending.token), "000000", null)).rejects.toMatchObject({ status: 401 });
    const full = await completeTwoFactor(sha256(pending.token), totpCode(setup.secret), null);
    expect((await userFromToken(full.token))?.id).toBe(user.id);
  });
});
