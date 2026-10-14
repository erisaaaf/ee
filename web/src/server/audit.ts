import "server-only";
import { db } from "./db";

/** Security/account audit trail. Never pass health data in `meta`. */
export async function audit(userId: string | null, event: string, meta?: Record<string, string | number | boolean>) {
  try {
    await db.auditLog.create({ data: { userId, event, meta } });
  } catch (err) {
    console.error("[audit] failed to write audit log", event, (err as Error).message);
  }
}
