import { NextResponse } from "next/server";
import { publicRoute } from "@/server/http";
import { registerSchema } from "@/lib/validation";
import { registerUser } from "@/server/services/auth";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

export const POST = publicRoute(
  async ({ body, req }) => {
    const input = await body(registerSchema);
    const user = await registerUser(input);
    const { token, expiresAt } = await createSession(user.id, { userAgent: req.headers.get("user-agent") });
    const res = NextResponse.json({ data: { id: user.id, email: user.email } }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return res;
  },
  { rateLimit: { name: "register", limit: 10, windowSec: 3600 } },
);
