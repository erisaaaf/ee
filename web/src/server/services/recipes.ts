import "server-only";
import { z } from "zod";
import { db } from "../db";
import { notFound } from "../errors";
import { recipeNutrition, type Per100 } from "@/lib/nutrition";
import { normalize } from "@/lib/text";
import { per100Of } from "./food";

export const recipeSchema = z.object({
  name: z.string().trim().min(1, "Give your recipe a name").max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  servings: z.number().positive().max(100),
  cookingMethod: z.string().trim().max(60).nullable().optional(),
  instructions: z.string().trim().max(10000).nullable().optional(),
  prepMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  photo: z
    .string()
    .max(300_000, "Photo is too large — please use a smaller image")
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Unsupported image")
    .nullable()
    .optional(),
  ingredients: z
    .array(
      z.object({
        foodId: z.string().nullable().optional(),
        name: z.string().trim().min(1).max(120),
        grams: z.number().min(0).max(20000),
        quantity: z.number().positive().max(10000).default(1),
        unitLabel: z.string().max(60).default("g"),
      }),
    )
    .min(1, "Add at least one ingredient")
    .max(60),
});

async function resolveIngredients(userId: string, ings: z.infer<typeof recipeSchema>["ingredients"]) {
  const ids = ings.map((i) => i.foodId).filter((x): x is string => !!x);
  const foods = await db.food.findMany({ where: { id: { in: ids }, OR: [{ ownerId: null }, { ownerId: userId }] } });
  return ings.map((i, position) => {
    const food = i.foodId ? foods.find((f) => f.id === i.foodId) : undefined;
    return {
      position,
      foodId: food?.id ?? null,
      name: i.name,
      grams: i.grams,
      quantity: i.quantity,
      unitLabel: i.unitLabel,
      per100: food ? (per100Of(food) as object) : undefined,
    };
  });
}

export async function createRecipe(userId: string, input: z.infer<typeof recipeSchema>, source: "user" | "ai" = "user") {
  const { ingredients, ...rest } = input;
  const recipe = await db.recipe.create({
    data: { userId, ...rest, source, ingredients: { create: await resolveIngredients(userId, ingredients) } },
  });
  return recipeWithNutrition(userId, recipe.id);
}

export async function updateRecipe(userId: string, id: string, input: z.infer<typeof recipeSchema>) {
  const existing = await db.recipe.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("recipe");
  const { ingredients, ...rest } = input;
  const resolved = await resolveIngredients(userId, ingredients);
  await db.$transaction([
    db.recipeIngredient.deleteMany({ where: { recipeId: id } }),
    db.recipe.update({ where: { id }, data: { ...rest, ingredients: { create: resolved } } }),
  ]);
  return recipeWithNutrition(userId, id);
}

export async function duplicateRecipe(userId: string, id: string) {
  const r = await db.recipe.findFirst({ where: { id, userId }, include: { ingredients: true } });
  if (!r) throw notFound("recipe");
  const copy = await db.recipe.create({
    data: {
      userId,
      name: `${r.name} (copy)`,
      description: r.description,
      servings: r.servings,
      cookingMethod: r.cookingMethod,
      instructions: r.instructions,
      prepMinutes: r.prepMinutes,
      photo: r.photo,
      source: r.source,
      ingredients: {
        create: r.ingredients.map(({ id: _id, recipeId: _r, ...i }) => ({ ...i, per100: i.per100 ?? undefined })),
      },
    },
  });
  return recipeWithNutrition(userId, copy.id);
}

export async function deleteRecipe(userId: string, id: string) {
  const { count } = await db.recipe.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("recipe");
  await db.favorite.deleteMany({ where: { userId, kind: "recipe", refId: id } });
}

export async function recipeWithNutrition(userId: string, id: string) {
  const r = await db.recipe.findFirst({ where: { id, userId }, include: { ingredients: { orderBy: { position: "asc" } } } });
  if (!r) throw notFound("recipe");
  const nutrition = recipeNutrition(
    r.ingredients.map((i) => ({ grams: i.grams, per100: (i.per100 as Per100 | null) ?? null })),
    r.servings,
  );
  const fav = await db.favorite.findUnique({ where: { userId_kind_refId: { userId, kind: "recipe", refId: id } } });
  return {
    ...r,
    ingredients: r.ingredients.map((i) => ({ ...i, hasNutrition: i.per100 != null })),
    nutrition,
    isFavorite: !!fav,
  };
}

export async function listRecipes(userId: string, q?: string) {
  const recipes = await db.recipe.findMany({ where: { userId }, include: { ingredients: true }, orderBy: { updatedAt: "desc" } });
  const favs = new Set((await db.favorite.findMany({ where: { userId, kind: "recipe" } })).map((f) => f.refId));
  const nq = q ? normalize(q) : "";
  return recipes
    .filter((r) => !nq || normalize(r.name).includes(nq))
    .map((r) => {
      const n = recipeNutrition(r.ingredients.map((i) => ({ grams: i.grams, per100: (i.per100 as Per100 | null) ?? null })), r.servings);
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        servings: r.servings,
        prepMinutes: r.prepMinutes,
        photo: r.photo,
        source: r.source,
        ingredientCount: r.ingredients.length,
        perServing: n.perServing,
        complete: n.complete,
        isFavorite: favs.has(r.id),
      };
    });
}
