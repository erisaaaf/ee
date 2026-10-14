import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/server/http";
import { deleteAccount } from "@/server/services/privacy";
import { SESSION_COOKIE } from "@/server/auth/session";

export const POST = authed(
  async ({ user, body }) => {
    const { password } = await body(z.object({ password: z.string().min(1).max(200), confirm: z.literal("DELETE") }));
    await deleteAccount(user.id, password);
    const res = NextResponse.json({ data: { ok: true } });
    res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  },
  { rateLimit: { name: "account-delete", limit: 5, windowSec: 3600 } },
);
