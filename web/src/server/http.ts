import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { AppError, badRequest, forbidden, unauthorized } from "./errors";
import { SESSION_COOKIE, userFromToken, type AuthUser } from "./auth/session";
import { enforceRateLimit } from "./ratelimit";
import { db } from "./db";
import { todayIn, isDateStr } from "@/lib/dates";

type Params = Record<string, string | string[]>;

export type Ctx<P extends Params = Params> = {
  req: NextRequest;
  params: P;
  /** Parse and validate the JSON body. */
  body: <T>(schema: ZodType<T>) => Promise<T>;
  /** Parse and validate query-string parameters. */
  query: <T>(schema: ZodType<T>) => T;
};

export type AuthedCtx<P extends Params = Params> = Ctx<P> & {
  user: AuthUser;
  /** The user's local "today" (from their timezone setting). */
  today: () => Promise<string>;
};

type RateLimitOpt = { name: string; limit: number; windowSec: number; by?: "user" | "ip" };

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Reject cross-site state-changing requests (CSRF defence in addition to SameSite=Lax cookies). */
function checkOrigin(req: NextRequest) {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw forbidden("This request was blocked for your security.");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    try {
      if (new URL(origin).host !== host) throw forbidden("This request was blocked for your security.");
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw forbidden("This request was blocked for your security.");
    }
  }
}

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const fields = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return Response.json(
      { error: { code: "invalid", message: "Some of the information isn't valid. Please check and try again.", details: fields } },
      { status: 400 },
    );
  }
  const requestId = randomUUID().slice(0, 8);
  // Log technical details for debugging, but never the request body (may contain health data).
  console.error(`[api] unhandled error ref=${requestId}:`, err instanceof Error ? err.stack ?? err.message : err);
  return Response.json(
    { error: { code: "server_error", message: "Something went wrong while processing your request. Please try again.", ref: requestId } },
    { status: 500 },
  );
}

function toResponse(result: unknown): Response {
  if (result instanceof Response) return result;
  if (result === undefined) return new Response(null, { status: 204 });
  return Response.json({ data: result });
}

function buildCtx<P extends Params>(req: NextRequest, params: P): Ctx<P> {
  return {
    req,
    params,
    body: async (schema) => {
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        throw badRequest("The request body is missing or not valid JSON.");
      }
      return schema.parse(raw);
    },
    query: (schema) => schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries())),
  };
}

type RouteContext<P> = { params: Promise<P> };

/** Wrap an authenticated route handler. */
export function authed<P extends Params = Params>(
  fn: (ctx: AuthedCtx<P>) => Promise<unknown>,
  opts: { rateLimit?: RateLimitOpt } = {},
) {
  return async (req: NextRequest, rc: RouteContext<P>) => {
    try {
      checkOrigin(req);
      const user = await userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
      if (!user) {
        const res = errorResponse(unauthorized("Your session has ended. Please sign in again."));
        // Clear a stale cookie so the routing guard doesn't bounce between pages.
        if (req.cookies.has(SESSION_COOKIE)) res.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
        return res;
      }
      if (opts.rateLimit) {
        const r = opts.rateLimit;
        await enforceRateLimit(`${r.name}:${r.by === "ip" ? clientIp(req) : user.id}`, r.limit, r.windowSec);
      }
      const params = (await rc?.params) ?? ({} as P);
      let todayCache: string | null = null;
      const ctx: AuthedCtx<P> = {
        ...buildCtx(req, params),
        user,
        today: async () => {
          if (todayCache) return todayCache;
          const p = await db.profile.findUnique({ where: { userId: user.id }, select: { timezone: true } });
          todayCache = todayIn(p?.timezone ?? "UTC");
          return todayCache;
        },
      };
      return toResponse(await fn(ctx));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Wrap a public (unauthenticated) route handler. */
export function publicRoute<P extends Params = Params>(
  fn: (ctx: Ctx<P> & { ip: string }) => Promise<unknown>,
  opts: { rateLimit?: Omit<RateLimitOpt, "by"> } = {},
) {
  return async (req: NextRequest, rc: RouteContext<P>) => {
    try {
      checkOrigin(req);
      const ip = clientIp(req);
      if (opts.rateLimit) await enforceRateLimit(`${opts.rateLimit.name}:${ip}`, opts.rateLimit.limit, opts.rateLimit.windowSec);
      const params = (await rc?.params) ?? ({} as P);
      return toResponse(await fn({ ...buildCtx(req, params), ip }));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

// ── Common validation pieces ──
export const zDate = z.string().refine(isDateStr, "Must be a date in YYYY-MM-DD format");
export const zId = z.string().min(1).max(64);
export const zClientId = z.string().min(8).max(64).optional();
export const zRangeQuery = z.object({ start: zDate, end: zDate }).refine((v) => v.start <= v.end, "start must be before end");

/** Respond with data plus any achievements newly earned by this action (shown as a celebration in the UI). */
export async function withAchievements(userId: string, data: unknown) {
  const { evaluateAchievements } = await import("./services/gamification");
  const achievements = await evaluateAchievements(userId).catch(() => []);
  return Response.json({ data, achievements });
}
