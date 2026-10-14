import { z } from "zod";
import { authed } from "@/server/http";
import { db } from "@/server/db";

export const GET = authed(async ({ user }) => db.groceryList.findMany({ where: { userId: user.id }, include: { items: true }, orderBy: { createdAt: "desc" } }));
export const POST = authed(async ({ user, body }) => {
  const { title } = await body(z.object({ title: z.string().trim().min(1).max(120) }));
  return db.groceryList.create({ data: { userId: user.id, title }, include: { items: true } });
});
