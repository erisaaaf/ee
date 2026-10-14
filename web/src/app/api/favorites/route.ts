import { z } from "zod";
import { authed } from "@/server/http";
import { db } from "@/server/db";

const favSchema = z.object({ kind: z.enum(["food", "meal", "recipe", "exercise", "workout", "sport"]), refId: z.string().min(1).max(64) });

export const GET = authed(async ({ user, query }) => {
  const { kind } = query(z.object({ kind: favSchema.shape.kind.optional() }));
  return db.favorite.findMany({ where: { userId: user.id, ...(kind ? { kind } : {}) }, select: { kind: true, refId: true } });
});

/** Toggle a favourite. */
export const POST = authed(async ({ user, body }) => {
  const { kind, refId } = await body(favSchema);
  const key = { userId_kind_refId: { userId: user.id, kind, refId } };
  const existing = await db.favorite.findUnique({ where: key });
  if (existing) {
    await db.favorite.delete({ where: key });
    return { favorite: false };
  }
  await db.favorite.create({ data: { userId: user.id, kind, refId } });
  return { favorite: true };
});
