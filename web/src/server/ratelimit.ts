import "server-only";
import { db } from "./db";
import { rateLimited } from "./errors";

/**
 * Fixed-window rate limiter backed by the database (works across server restarts).
 * Throws a friendly 429 AppError when the limit is exceeded.
 */
export async function enforceRateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const now = new Date();
  const windowStartCutoff = new Date(now.getTime() - windowSec * 1000);
  const existing = await db.rateLimit.findUnique({ where: { key } });
  if (!existing || existing.windowStart < windowStartCutoff) {
    await db.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now },
    });
    return;
  }
  if (existing.count >= limit) throw rateLimited();
  await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
}

/** Non-throwing variant that reports remaining quota. */
export async function checkQuota(key: string, limit: number, windowSec: number) {
  const existing = await db.rateLimit.findUnique({ where: { key } });
  const fresh = !existing || existing.windowStart < new Date(Date.now() - windowSec * 1000);
  const used = fresh ? 0 : existing!.count;
  return { used, remaining: Math.max(0, limit - used), limit };
}
