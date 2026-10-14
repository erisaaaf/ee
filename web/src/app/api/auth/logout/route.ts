import { NextResponse } from "next/server";
import { publicRoute } from "@/server/http";
import { destroySession, SESSION_COOKIE } from "@/server/auth/session";

export const POST = publicRoute(async ({ req }) => {
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
