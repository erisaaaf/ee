import "server-only";
import type { z } from "zod";
import { db } from "../db";
import { notFound, forbidden, badRequest } from "../errors";
import { NUTRIENT_KEYS, plausiblePer100, type Per100 } from "@/lib/nutrition";
import { foodSearchText, normalize } from "@/lib/text";
import { classifyScan } from "@/lib/barcode";
import type { customFoodSchema } from "@/lib/validation";
import { offLookupBarcode, offSearch, usdaConfigured, usdaGet, usdaSearch, type ExternalFood } from "../food/providers";
import type { Food, FoodServing } from "@/generated/prisma/client";

export type FoodDTO = {
  id: string;
  name: string;
  localNames: Record<string, string> | null;
  brand: string | null;
  barcode: string | null;
  category: string | null;
  source: string;
  sourceRef: string | null;
  dataQuality: string;
  servingG: number;
  servingLabel: string;
  isLiquid: boolean;
  per100: Per100;
  servings: { label: string; grams: number }[];
  isOwn: boolean;
  isFavorite?: boolean;
};

export function per100Of(f: Pick<Food, (typeof NUTRIENT_KEYS)[number]>): Per100 {
  const out: Per100 = {};
  for (const k of NUTRIENT_KEYS) out[k] = f[k];
  return out;
}

export function toFoodDTO(f: Food & { servings?: FoodServing[] }, userId?: string, favIds?: Set<string>): FoodDTO {
  return {
    id: f.id,
    name: f.name,
    localNames: (f.localNames as Record<string, string> | null) ?? null,
    brand: f.brand,
    barcode: f.barcode,
    category: f.category,
    source: f.source,
    sourceRef: f.sourceRef,
    dataQuality: f.dataQuality,
    servingG: f.servingG,
    servingLabel: f.servingLabel,
    isLiquid: f.isLiquid,
    per100: per100Of(f),
    servings: [
      { label: f.servingLabel, grams: f.servingG },
      ...(f.servings ?? []).map((s) => ({ label: `${s.label} (${s.grams} ${f.isLiquid ? "ml" : "g"})`, grams: s.grams })),
    ].filter((s, i, arr) => arr.findIndex((x) => x.grams === s.grams) === i),
    isOwn: !!userId && f.ownerId === userId,
    isFavorite: favIds?.has(f.id),
  };
}

const visibleTo = (userId: string) => ({ deletedAt: null, OR: [{ ownerId: null }, { ownerId: userId }] });

export async function searchFoods(userId: string, query: string, limit = 25) {
  const tokens = normalize(query).split(" ").filter((t) => t.length > 0).slice(0, 6);
  if (!tokens.length) return [];
  const rows = await db.food.findMany({
    where: { ...visibleTo(userId), AND: tokens.map((t) => ({ searchText: { contains: t } })) },
    include: { servings: true },
    take: 200,
  });
  const favs = await favoriteIds(userId, "food");
  const q = normalize(query);
  const score = (f: Food) => {
    const name = normalize(f.name);
    let s = 0;
    if (f.ownerId === userId) s += 50;
    if (favs.has(f.id)) s += 40;
    if (name === q) s += 30;
    if (name.startsWith(q)) s += 20;
    if (f.source === "builtin") s += 5;
    return s - name.length / 10;
  };
  return rows
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
    .map((f) => toFoodDTO(f, userId, favs));
}

export async function getFood(userId: string, id: string) {
  const f = await db.food.findFirst({ where: { id, ...visibleTo(userId) }, include: { servings: true } });
  if (!f) throw notFound("food");
  return toFoodDTO(f, userId, await favoriteIds(userId, "food"));
}

async function favoriteIds(userId: string, kind: string) {
  const favs = await db.favorite.findMany({ where: { userId, kind }, select: { refId: true } });
  return new Set(favs.map((f) => f.refId));
}

/** Upsert an external record into the shared cache so repeat lookups don't hit the network. */
async function cacheExternal(ext: ExternalFood) {
  const data = {
    name: ext.name,
    brand: ext.brand,
    barcode: ext.barcode,
    searchText: foodSearchText(ext.name, ext.brand),
    source: ext.provider,
    sourceRef: ext.ref,
    dataQuality: "label",
    servingG: ext.servingG ?? 100,
    servingLabel: ext.servingG ? `1 serving (${ext.servingG} ${ext.isLiquid ? "ml" : "g"})` : `100 ${ext.isLiquid ? "ml" : "g"}`,
    isLiquid: ext.isLiquid,
    ...ext.per100,
  };
  const existing = await db.food.findFirst({ where: { source: ext.provider, sourceRef: ext.ref, ownerId: null } });
  const food = existing
    ? await db.food.update({ where: { id: existing.id }, data, include: { servings: true } })
    : await db.food.create({ data, include: { servings: true } });
  return food;
}

export type BarcodeLookup =
  | { status: "found"; food: FoodDTO; attribution: string; fromQr: boolean }
  | { status: "not_found"; gtin: string; message: string }
  | { status: "invalid"; message: string }
  | { status: "not_food_code"; kind: "url" | "text"; content: string; message: string };

export async function lookupBarcode(userId: string, raw: string): Promise<BarcodeLookup> {
  const scan = classifyScan(raw);
  if (scan.kind === "invalid_barcode") return { status: "invalid", message: scan.reason };
  if (scan.kind === "url" || scan.kind === "text") {
    return {
      status: "not_food_code",
      kind: scan.kind,
      content: scan.kind === "url" ? scan.url : scan.text,
      message:
        "This QR code doesn't contain a product barcode, so we can't look up nutrition from it. It is not treated as nutrition information.",
    };
  }
  const gtin = scan.gtin;
  const candidates = [gtin, gtin.padStart(13, "0"), gtin.replace(/^0+/, "")];
  const local = await db.food.findFirst({ where: { barcode: { in: candidates }, ...visibleTo(userId) }, include: { servings: true }, orderBy: { ownerId: "desc" } });
  if (local) {
    const attribution = local.source === "user" ? "Your custom food" : local.source === "openfoodfacts" ? "Open Food Facts (cached)" : local.source;
    return { status: "found", food: toFoodDTO(local, userId), attribution, fromQr: scan.fromQr };
  }
  const ext = await offLookupBarcode(gtin);
  if (!ext) {
    return { status: "not_found", gtin, message: "We couldn't find this product. You can add it yourself from the label." };
  }
  const cached = await cacheExternal({ ...ext, barcode: ext.barcode ?? gtin });
  return { status: "found", food: toFoodDTO(cached, userId), attribution: ext.attribution, fromQr: scan.fromQr };
}

export async function externalSearch(query: string) {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return { results: [] as ExternalFood[], providers: [] as string[], errors: [] as string[] };
  const tasks: [string, Promise<ExternalFood[]>][] = [["Open Food Facts", offSearch(q)]];
  if (usdaConfigured()) tasks.push(["USDA FoodData Central", usdaSearch(q)]);
  const settled = await Promise.allSettled(tasks.map(([, p]) => p));
  const results: ExternalFood[] = [];
  const errors: string[] = [];
  settled.forEach((s) => (s.status === "fulfilled" ? results.push(...s.value) : errors.push((s.reason as Error).message)));
  return { results, providers: tasks.map(([n]) => n), errors };
}

/** Import an external result by provider reference. The server re-fetches; client-sent nutrition is never trusted. */
export async function importExternal(userId: string, provider: "openfoodfacts" | "usda", ref: string) {
  const ext = provider === "openfoodfacts" ? await offLookupBarcode(ref) : await usdaGet(ref);
  if (!ext) throw notFound("product");
  return toFoodDTO(await cacheExternal(ext), userId);
}

// ── Custom foods ──

function customToPer100(input: z.infer<typeof customFoodSchema>): Per100 {
  const factor = input.basis === "perServing" ? 100 / input.servingG : 1;
  const per100: Per100 = {};
  for (const k of NUTRIENT_KEYS) {
    const v = input[k];
    per100[k] = v == null ? null : Math.round(v * factor * 100) / 100;
  }
  const check = plausiblePer100(per100);
  if (!check.ok) throw badRequest(`These values don't look right (${check.reason}). Please check the label.`);
  return per100;
}

export async function createCustomFood(userId: string, input: z.infer<typeof customFoodSchema>) {
  const per100 = customToPer100(input);
  const food = await db.food.create({
    data: {
      ownerId: userId,
      name: input.name,
      brand: input.brand ?? null,
      barcode: input.barcode ?? null,
      searchText: foodSearchText(input.name, input.brand),
      source: "user",
      dataQuality: "user",
      servingG: input.servingG,
      servingLabel: input.servingLabel,
      isLiquid: input.isLiquid ?? false,
      ...per100,
    },
    include: { servings: true },
  });
  return toFoodDTO(food, userId);
}

async function ownFood(userId: string, id: string) {
  const f = await db.food.findUnique({ where: { id } });
  if (!f || f.deletedAt) throw notFound("food");
  if (f.ownerId !== userId) throw forbidden("You can only change foods you created.");
  return f;
}

export async function updateCustomFood(userId: string, id: string, input: z.infer<typeof customFoodSchema>) {
  await ownFood(userId, id);
  const per100 = customToPer100(input);
  const food = await db.food.update({
    where: { id },
    data: {
      name: input.name,
      brand: input.brand ?? null,
      barcode: input.barcode ?? null,
      searchText: foodSearchText(input.name, input.brand),
      servingG: input.servingG,
      servingLabel: input.servingLabel,
      isLiquid: input.isLiquid ?? false,
      ...per100,
    },
    include: { servings: true },
  });
  return toFoodDTO(food, userId);
}

/** Soft delete: past diary entries keep their nutrition snapshot, so history stays correct. */
export async function deleteCustomFood(userId: string, id: string) {
  await ownFood(userId, id);
  await db.food.update({ where: { id }, data: { deletedAt: new Date() } });
  await db.favorite.deleteMany({ where: { userId, kind: "food", refId: id } });
}

export async function listCustomFoods(userId: string) {
  const foods = await db.food.findMany({ where: { ownerId: userId, deletedAt: null }, include: { servings: true }, orderBy: { name: "asc" } });
  return foods.map((f) => toFoodDTO(f, userId));
}

export async function recentFoods(userId: string, limit = 15) {
  const entries = await db.foodLogEntry.findMany({
    where: { userId, foodId: { not: null } },
    orderBy: { loggedAt: "desc" },
    take: 200,
    select: { foodId: true, grams: true },
  });
  const seen = new Map<string, number>();
  for (const e of entries) if (e.foodId && !seen.has(e.foodId)) seen.set(e.foodId, e.grams);
  const ids = [...seen.keys()].slice(0, limit);
  const foods = await db.food.findMany({ where: { id: { in: ids }, ...visibleTo(userId) }, include: { servings: true } });
  const favs = await favoriteIds(userId, "food");
  return ids
    .map((id) => foods.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ ...toFoodDTO(f, userId, favs), lastGrams: seen.get(f.id)! }));
}

export async function favoriteFoods(userId: string) {
  const ids = [...(await favoriteIds(userId, "food"))];
  const foods = await db.food.findMany({ where: { id: { in: ids }, ...visibleTo(userId) }, include: { servings: true } });
  return foods.map((f) => toFoodDTO(f, userId, new Set(ids)));
}
