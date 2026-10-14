// Idempotent seed: loads the built-in food catalogue and exercise library.
// Safe to re-run — it updates existing built-in rows and never touches user data.
import "dotenv/config";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { catalogFoods } from "../src/server/food/catalog";
import { EXERCISES } from "../src/server/fitness/exercises";
import { foodSearchText } from "../src/lib/text";

const raw = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const file = raw.replace(/^file:/, "");
const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: path.isAbsolute(file) || file === ":memory:" ? file : path.resolve(process.cwd(), file) }),
});

const PROVENANCE: Record<string, string> = {
  reference: "Typical values compiled from public food-composition tables (e.g. USDA FoodData Central). Products vary.",
  estimate: "Rough estimate for a typical home/restaurant recipe. Real recipes vary widely.",
};

async function seedFoods() {
  let created = 0;
  let updated = 0;
  for (const f of catalogFoods()) {
    const defaultServing = f.servings[0];
    const data = {
      name: f.name,
      localNames: f.localNames ?? undefined,
      searchText: foodSearchText(f.name, null, f.localNames),
      category: f.category,
      region: f.region,
      source: "builtin",
      sourceRef: PROVENANCE[f.quality],
      dataQuality: f.quality,
      servingG: defaultServing?.grams ?? 100,
      servingLabel: defaultServing ? `${defaultServing.label} (${defaultServing.grams} ${f.isLiquid ? "ml" : "g"})` : "100 g",
      isLiquid: f.isLiquid,
      ...f.per100,
    };
    const existing = await db.food.findFirst({ where: { source: "builtin", name: f.name, ownerId: null } });
    if (existing) {
      await db.food.update({ where: { id: existing.id }, data });
      await db.foodServing.deleteMany({ where: { foodId: existing.id } });
      await db.foodServing.createMany({ data: f.servings.map((s) => ({ foodId: existing.id, label: s.label, grams: s.grams })) });
      updated++;
    } else {
      await db.food.create({ data: { ...data, servings: { create: f.servings } } });
      created++;
    }
  }
  console.log(`Foods: ${created} created, ${updated} updated`);
}

async function seedExercises() {
  for (const e of EXERCISES) {
    const data = {
      name: e.name,
      category: e.category,
      muscleGroups: e.muscles,
      equipment: e.equipment,
      difficulty: e.difficulty,
      instructions: e.steps,
      commonMistakes: e.mistakes,
      alternatives: e.alternatives,
      homeVersion: e.home ?? null,
      gymVersion: e.gym ?? null,
      trackingType: e.tracking,
    };
    await db.exercise.upsert({ where: { slug: e.slug }, create: { slug: e.slug, ...data }, update: data });
  }
  console.log(`Exercises: ${EXERCISES.length} upserted`);
}

async function main() {
  await seedFoods();
  await seedExercises();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
