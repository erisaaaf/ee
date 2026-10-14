import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/server/http";
import { completeTwoFactor } from "@/server/services/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";
import { sha256 } from "@/server/crypto";
import { unauthorized } from "@/server/errors";

export const POST = publicRoute(
  async ({ body, req }) => {
    const { code } = await body(z.object({ code: z.string().min(6).max(10) }));
    const pending = req.cookies.get("vt_2fa")?.value;
    if (!pending) throw unauthorized("Your sign-in expired. Please enter your email and password again.");
    const { token, expiresAt } = await completeTwoFactor(sha256(pending), code, req.headers.get("user-agent"));
    const res = NextResponse.json({ data: { ok: true } });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    res.cookies.set("vt_2fa", "", { path: "/api/auth/2fa", maxAge: 0 });
    return res;
  },
  { rateLimit: { name: "2fa", limit: 10, windowSec: 600 } },
);
