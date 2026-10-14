import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { AppError, unavailable } from "../errors";
import { enforceRateLimit, checkQuota } from "../ratelimit";

// AI provider boundary. Keys live only on the server (ANTHROPIC_API_KEY); nothing here is imported by client code.
// If no key is configured, every AI feature reports an honest "not configured" state — no canned answers.

export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5-5";
// Server-side refusal fallback: if a safety classifier declines, the API re-runs on a fallback model automatically.
export const AI_BETAS = ["server-side-fallback-2026-07-01"] as const;
export const AI_FALLBACKS = "default" as const;

let client: Anthropic | null = null;
export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getClient(): Anthropic {
  if (!aiConfigured()) {
    throw unavailable("ai_not_configured", "AI features aren't set up on this server yet. An administrator needs to add an Anthropic API key.");
  }
  client ??= new Anthropic({ timeout: 90_000, maxRetries: 2 });
  return client;
}

const hourlyLimit = () => Math.max(1, Number(process.env.AI_HOURLY_LIMIT) || 40);

/** Checks the user's AI switch and per-user hourly quota (cost control). */
export async function guardAi(userId: string, feature: string) {
  const s = await db.settings.findUnique({ where: { userId }, select: { aiEnabled: true } });
  if (s && !s.aiEnabled) throw new AppError(403, "ai_disabled", "AI features are turned off in your privacy settings.");
  getClient();
  try {
    await enforceRateLimit(`ai:${userId}`, hourlyLimit(), 3600);
  } catch {
    throw new AppError(429, "ai_quota", "You've reached the hourly limit for AI requests. Please try again a bit later.");
  }
  void feature;
}

export async function aiStatus(userId: string) {
  const s = await db.settings.findUnique({ where: { userId }, select: { aiEnabled: true } });
  const quota = await checkQuota(`ai:${userId}`, hourlyLimit(), 3600);
  return { configured: aiConfigured(), enabledByUser: s?.aiEnabled ?? true, model: aiConfigured() ? AI_MODEL : null, quota };
}

/** Map SDK errors to friendly AppErrors (technical detail is logged, not shown). */
export function mapAiError(err: unknown): never {
  if (err instanceof AppError) throw err;
  if (err instanceof Anthropic.RateLimitError) throw new AppError(503, "ai_busy", "The AI service is busy right now. Please try again in a minute.");
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    console.error("[ai] authentication problem:", err.message);
    throw unavailable("ai_auth", "The AI service isn't configured correctly. An administrator needs to check the API key.");
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.error("[ai] bad request:", err.message);
    throw new AppError(502, "ai_bad_request", "The AI couldn't process that request. Try rephrasing or using a smaller image.");
  }
  if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.APIConnectionTimeoutError) {
    throw unavailable("ai_unreachable", "We couldn't reach the AI service. Check your connection and try again.");
  }
  if (err instanceof Anthropic.APIError) {
    console.error(`[ai] API error ${err.status}:`, err.message);
    throw unavailable("ai_error", "The AI service had a problem. Please try again.");
  }
  throw err;
}

export const REFUSAL_MESSAGE =
  "I can't help with that request. For health concerns, please talk to a doctor or another qualified professional.";
