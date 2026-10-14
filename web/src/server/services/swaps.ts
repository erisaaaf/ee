import "server-only";
import { db } from "../db";
import { notFound } from "../errors";
import { allergenConflicts, dietConflicts } from "@/lib/allergens";
import { getMe } from "./profile";
import { per100Of, toFoodDTO } from "./food";

// Rule-based swaps from database values (no AI needed). Neutral language: we describe differences,
// we never label foods as good or bad.
const RELATED: Record<string, string[]> = {
  grain: ["grain", "bread"],
  bread: ["bread", "grain"],
  dairy: ["dairy"],
  meat: ["meat", "fish", "legume", "egg"],
  fish: ["fish", "meat", "legume"],
  legume: ["legume", "meat", "fish"],
  snack: ["snack", "nuts", "fruit"],
  sweets: ["sweets", "fruit", "nuts"],
  drink: ["drink"],
  "fast-food": ["fast-food", "dish", "balkan-dish"],
  spread: ["spread", "condiment"],
  condiment: ["condiment", "spread"],
  fat: ["fat"],
  fruit: ["fruit"],
  vegetable: ["vegetable"],
  nuts: ["nuts", "seeds"],
  seeds: ["seeds", "nuts"],
};

type Dim = { key: "fiberG" | "proteinG" | "sodiumMg" | "sugarG" | "kcal"; better: "higher" | "lower"; label: string; minDiff: number };
const DIMS: Dim[] = [
  { key: "fiberG", better: "higher", label: "more fibre", minDiff: 1.5 },
  { key: "proteinG", better: "higher", label: "more protein", minDiff: 4 },
  { key: "sodiumMg", better: "lower", label: "less sodium", minDiff: 150 },
  { key: "sugarG", better: "lower", label: "less sugar", minDiff: 4 },
  { key: "kcal", better: "lower", label: "fewer calories per 100 g", minDiff: 60 },
];

export async function swapsForFood(userId: string, foodId: string) {
  const food = await db.food.findFirst({ where: { id: foodId, deletedAt: null, OR: [{ ownerId: null }, { ownerId: userId }] } });
  if (!food) throw notFound("food");
  const me = await getMe(userId);
  const cats = RELATED[food.category ?? ""] ?? [food.category ?? ""];
  const candidates = await db.food.findMany({
    where: { id: { not: food.id }, deletedAt: null, category: { in: cats }, OR: [{ ownerId: null }, { ownerId: userId }], source: { in: ["builtin", "user"] } },
    include: { servings: true },
  });
  const base = per100Of(food);
  const out = [];
  for (const c of candidates) {
    if (allergenConflicts([c.name], me.preferences.allergies).length) continue;
    if (dietConflicts([c.name], me.preferences.dietPattern).length) continue;
    if (me.preferences.dislikes.some((d) => c.name.toLowerCase().includes(d.toLowerCase()))) continue;
    const p = per100Of(c);
    const reasons: string[] = [];
    let score = 0;
    for (const d of DIMS) {
      const a = base[d.key];
      const b = p[d.key];
      if (a == null || b == null) continue;
      const diff = d.better === "higher" ? b - a : a - b;
      if (diff >= d.minDiff) {
        reasons.push(`${d.label} (${Math.round(b)} vs ${Math.round(a)} ${d.key === "kcal" ? "kcal" : d.key === "sodiumMg" ? "mg" : "g"} per 100 g)`);
        score += diff / d.minDiff;
      }
    }
    if (!reasons.length) continue;
    out.push({ food: toFoodDTO(c, userId), reasons, score });
  }
  out.sort((a, b) => b.score - a.score);
  return {
    original: toFoodDTO(food, userId),
    suggestions: out.slice(0, 5).map(({ food, reasons }) => ({ food, why: `Similar kind of food with ${reasons.join(", ")}.` })),
    note: "These are options, not rules. Values are typical per 100 g; portion sizes and how foods fit your day matter more than any single swap.",
  };
}
