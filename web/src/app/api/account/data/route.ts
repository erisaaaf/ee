import { z } from "zod";
import { authed } from "@/server/http";
import { DATA_CATEGORIES, dataInventory, deleteCategory, type DataCategory } from "@/server/services/privacy";

export const GET = authed(async ({ user }) => dataInventory(user.id));

export const DELETE = authed(async ({ user, body }) => {
  const { category } = await body(
    z.object({ category: z.enum(Object.keys(DATA_CATEGORIES) as [DataCategory, ...DataCategory[]]), confirm: z.literal(true) }),
  );
  await deleteCategory(user.id, category);
  return dataInventory(user.id);
});
