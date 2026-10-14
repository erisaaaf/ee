import { NextResponse } from "next/server";
import { publicRoute } from "@/server/http";
import { loginSchema } from "@/lib/validation";
import { loginUser } from "@/server/services/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

const PENDING_2FA_COOKIE = "vt_2fa";

export const POST = publicRoute(
  async ({ body, req }) => {
    const { email, password } = await body(loginSchema);
    const result = await loginUser(email, password, req.headers.get("user-agent"));
    const res = NextResponse.json({ data: { requires2fa: result.requires2fa } });
    if (result.requires2fa) {
      res.cookies.set(PENDING_2FA_COOKIE, result.token, { ...sessionCookieOptions(result.expiresAt), path: "/api/auth/2fa" });
    } else {
      res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
    }
    return res;
  },
  { rateLimit: { name: "login", limit: 20, windowSec: 900 } },
);
