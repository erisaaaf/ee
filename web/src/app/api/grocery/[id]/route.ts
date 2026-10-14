import { z } from "zod";
import { authed } from "@/server/http";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";

async function own(userId: string, id: string) {
  const l = await db.groceryList.findFirst({ where: { id, userId } });
  if (!l) throw notFound("grocery list");
  return l;
}

export const GET = authed<{ id: string }>(async ({ user, params }) => {
  await own(user.id, params.id);
  return db.groceryList.findUnique({ where: { id: params.id }, include: { items: { orderBy: [{ category: "asc" }, { name: "asc" }] } } });
});
export const DELETE = authed<{ id: string }>(async ({ user, params }) => {
  await own(user.id, params.id);
  await db.groceryList.delete({ where: { id: params.id } });
});

const itemOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), name: z.string().trim().min(1).max(80), quantity: z.string().max(30).nullable().optional(), category: z.string().max(30).default("Other") }),
  z.object({ op: z.literal("update"), itemId: z.string(), checked: z.boolean().optional(), quantity: z.string().max(30).nullable().optional(), name: z.string().trim().min(1).max(80).optional() }),
  z.object({ op: z.literal("remove"), itemId: z.string() }),
  z.object({ op: z.literal("clear_checked") }),
]);

export const PATCH = authed<{ id: string }>(async ({ user, params, body }) => {
  await own(user.id, params.id);
  const o = await body(itemOp);
  if (o.op === "add") await db.groceryItem.create({ data: { listId: params.id, name: o.name, quantity: o.quantity ?? null, category: o.category } });
  if (o.op === "update") await db.groceryItem.updateMany({ where: { id: o.itemId, listId: params.id }, data: { checked: o.checked, quantity: o.quantity, name: o.name } });
  if (o.op === "remove") await db.groceryItem.deleteMany({ where: { id: o.itemId, listId: params.id } });
  if (o.op === "clear_checked") await db.groceryItem.deleteMany({ where: { listId: params.id, checked: true } });
  return db.groceryList.findUnique({ where: { id: params.id }, include: { items: { orderBy: [{ category: "asc" }, { name: "asc" }] } } });
});
