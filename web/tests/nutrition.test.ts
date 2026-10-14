import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addEntry, copyMeal, dayDiary, deleteEntry, logSavedMeal, nutritionRange, saveMealFromDiary, updateEntry } from "@/server/services/diary";
import { createCustomFood, deleteCustomFood, getFood, lookupBarcode, searchFoods, updateCustomFood } from "@/server/services/food";
import { createRecipe, duplicateRecipe, recipeWithNutrition, updateRecipe } from "@/server/services/recipes";
import { cid, makeUser } from "./helpers";

const D = "2026-10-11";

async function foodId(name: string) {
  return (await db.food.findFirstOrThrow({ where: { name, source: "builtin" } })).id;
}

describe("food search", () => {
  it("finds built-in foods by English and Albanian names, ignoring diacritics", async () => {
    const { user } = await makeUser();
    expect((await searchFoods(user.id, "apple"))[0].name).toBe("Apple, raw");
    expect((await searchFoods(user.id, "molle"))[0].name).toBe("Apple, raw");
    expect((await searchFoods(user.id, "fergese")).map((f) => f.name)).toContain("Fërgesë (peppers, tomato & cottage cheese)");
    const burek = await searchFoods(user.id, "byrek");
    expect(burek.length).toBeGreaterThanOrEqual(3);
    expect(burek.every((f) => f.dataQuality === "estimate")).toBe(true);
  });

  it("returns an empty list (not an error) for no matches", async () => {
    const { user } = await makeUser();
    expect(await searchFoods(user.id, "zzzxqqnotafood")).toEqual([]);
  });
});

describe("food diary", () => {
  it("computes entry totals server-side and updates day totals on edit and delete", async () => {
    const { user } = await makeUser();
    const apple = await foodId("Apple, raw");
    const e1 = await addEntry(user.id, { kind: "food", foodId: apple, grams: 182, quantity: 1, unitLabel: "1 medium", date: D, mealType: "breakfast", source: "search", clientId: cid() });
    expect(e1.totals.kcal).toBe(95);
    const egg = await foodId("Egg, hard-boiled");
    await addEntry(user.id, { kind: "food", foodId: egg, grams: 100, quantity: 2, unitLabel: "1 large", date: D, mealType: "breakfast", source: "search" });

    let day = await dayDiary(user.id, D);
    expect(day.totals.values.kcal).toBe(95 + 155);
    expect(day.meals.breakfast.entries).toHaveLength(2);
    expect(day.meals.lunch.entries).toHaveLength(0);

    await updateEntry(user.id, e1.id, { grams: 364, quantity: 2 });
    day = await dayDiary(user.id, D);
    expect(day.totals.values.kcal).toBe(189 + 155);

    await deleteEntry(user.id, e1.id);
    day = await dayDiary(user.id, D);
    expect(day.totals.values.kcal).toBe(155);
    expect(day.entryCount).toBe(1);
  });

  it("is idempotent for repeated submissions with the same clientId", async () => {
    const { user } = await makeUser();
    const apple = await foodId("Apple, raw");
    const clientId = cid();
    const input = { kind: "food" as const, foodId: apple, grams: 100, quantity: 1, unitLabel: "g", date: D, mealType: "snack" as const, source: "search" as const, clientId };
    const a = await addEntry(user.id, input);
    const b = await addEntry(user.id, input);
    expect(a.id).toBe(b.id);
    expect((await dayDiary(user.id, D)).entryCount).toBe(1);
  });

  it("flags estimate entries and rejects implausible values", async () => {
    const { user } = await makeUser();
    const e = await addEntry(user.id, { kind: "estimate", name: "Plate of pasta (photo estimate)", per100: { kcal: 160, proteinG: 6, carbsG: 30, fatG: 2 }, grams: 300, quantity: 1, unitLabel: "plate", date: D, mealType: "dinner", source: "photo" });
    expect(e.isEstimate).toBe(true);
    expect(e.totals.kcal).toBe(480);
    await expect(
      addEntry(user.id, { kind: "estimate", name: "bad", per100: { kcal: 100, proteinG: 90, carbsG: 50, fatG: 0 }, grams: 100, quantity: 1, unitLabel: "g", date: D, mealType: "dinner", source: "quick" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("reports days without logs as missing, not zero", async () => {
    const { user } = await makeUser();
    await addEntry(user.id, { kind: "food", foodId: await foodId("Banana, raw"), grams: 118, quantity: 1, unitLabel: "1 medium", date: "2026-10-10", mealType: "snack", source: "search" });
    const range = await nutritionRange(user.id, "2026-10-09", "2026-10-11");
    expect(range.map((d) => d.logged)).toEqual([false, true, false]);
  });

  it("copies meals and logs saved meals", async () => {
    const { user } = await makeUser();
    await addEntry(user.id, { kind: "food", foodId: await foodId("Oats, rolled (dry)"), grams: 40, quantity: 1, unitLabel: "½ cup", date: D, mealType: "breakfast", source: "search" });
    expect(await copyMeal(user.id, { date: D, mealType: "breakfast" }, { date: "2026-10-12", mealType: "breakfast" })).toBe(1);
    const saved = await saveMealFromDiary(user.id, D, "breakfast", "My oats");
    await logSavedMeal(user.id, saved.id, "2026-10-13", "breakfast");
    const d12 = await dayDiary(user.id, "2026-10-12");
    const d13 = await dayDiary(user.id, "2026-10-13");
    expect(d12.totals.values.kcal).toBe(d13.totals.values.kcal);
    expect(d13.totals.values.kcal).toBeGreaterThan(0);
  });

  it("never lets one user read or modify another user's entries", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const e = await addEntry(a.user.id, { kind: "food", foodId: await foodId("Apple, raw"), grams: 100, quantity: 1, unitLabel: "g", date: D, mealType: "snack", source: "search" });
    await expect(updateEntry(b.user.id, e.id, { grams: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(deleteEntry(b.user.id, e.id)).rejects.toMatchObject({ status: 404 });
    expect((await dayDiary(b.user.id, D)).entryCount).toBe(0);
  });
});

describe("custom foods", () => {
  it("converts per-serving label values to per-100 g, and keeps history after deletion", async () => {
    const { user } = await makeUser();
    const food = await createCustomFood(user.id, { name: "Granola bar", brand: "Home", servingG: 40, servingLabel: "1 bar", basis: "perServing", kcal: 180, proteinG: 4, carbsG: 24, fatG: 7, barcode: "96385074" });
    expect(food.per100.kcal).toBe(450);
    expect(food.isOwn).toBe(true);
    // Barcode lookup finds the user's own food (no network).
    const scan = await lookupBarcode(user.id, "96385074");
    expect(scan.status).toBe("found");

    const e = await addEntry(user.id, { kind: "food", foodId: food.id, grams: 40, quantity: 1, unitLabel: "1 bar", date: D, mealType: "snack", source: "search" });
    await updateCustomFood(user.id, food.id, { name: "Granola bar v2", servingG: 40, servingLabel: "1 bar", basis: "perServing", kcal: 200 });
    await deleteCustomFood(user.id, food.id);
    const day = await dayDiary(user.id, D);
    expect(day.meals.snack.entries[0].id).toBe(e.id);
    expect(day.totals.values.kcal).toBe(180); // snapshot preserved
    await expect(getFood(user.id, food.id)).rejects.toMatchObject({ status: 404 });
  });

  it("other users cannot see or edit someone's custom food", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const food = await createCustomFood(a.user.id, { name: "Secret sauce zz", servingG: 15, servingLabel: "1 tbsp", basis: "per100", kcal: 300 });
    expect(await searchFoods(b.user.id, "secret sauce zz")).toEqual([]);
    await expect(updateCustomFood(b.user.id, food.id, { name: "x", servingG: 1, servingLabel: "x", basis: "per100" })).rejects.toBeTruthy();
  });

  it("classifies non-product QR codes without treating them as nutrition", async () => {
    const { user } = await makeUser();
    expect(await lookupBarcode(user.id, "https://example.com")).toMatchObject({ status: "not_food_code", kind: "url" });
    expect(await lookupBarcode(user.id, "1234567890123")).toMatchObject({ status: "invalid" });
  });
});

describe("recipes", () => {
  it("calculates per-serving nutrition and recalculates on edit", async () => {
    const { user } = await makeUser();
    const chicken = await foodId("Chicken breast, roasted, skinless");
    const pasta = await foodId("Pasta, dry");
    const oil = await foodId("Olive oil");
    const r = await createRecipe(user.id, {
      name: "Homemade chicken pasta",
      servings: 2,
      ingredients: [
        { foodId: chicken, name: "Chicken", grams: 200, quantity: 1, unitLabel: "g" },
        { foodId: pasta, name: "Pasta", grams: 160, quantity: 1, unitLabel: "g" },
        { foodId: oil, name: "Olive oil", grams: 13.5, quantity: 1, unitLabel: "tbsp" },
      ],
    });
    const expectedTotal = Math.round(330 + 371 * 1.6 + 884 * 0.135);
    expect(Math.abs(r.nutrition.total.values.kcal - expectedTotal)).toBeLessThanOrEqual(2);
    expect(r.nutrition.complete).toBe(true);

    const updated = await updateRecipe(user.id, r.id, {
      name: r.name,
      servings: 4,
      ingredients: [
        { foodId: chicken, name: "Chicken", grams: 200, quantity: 1, unitLabel: "g" },
        { foodId: null, name: "Secret spice mix", grams: 5, quantity: 1, unitLabel: "g" },
      ],
    });
    expect(updated.nutrition.perServing.kcal).toBe(Math.round(330 / 4));
    expect(updated.nutrition.complete).toBe(false);

    const copy = await duplicateRecipe(user.id, r.id);
    expect(copy.name).toContain("(copy)");
    expect(copy.nutrition.total.values.kcal).toBe(updated.nutrition.total.values.kcal);

    // Logging one serving of the recipe adds the per-serving energy.
    const entry = await addEntry(user.id, { kind: "recipe", recipeId: r.id, servings: 1, date: D, mealType: "dinner" });
    expect(Math.abs((entry.totals.kcal ?? 0) - updated.nutrition.perServing.kcal)).toBeLessThanOrEqual(1);
    expect(entry.isEstimate).toBe(true); // incomplete recipe → estimate
  });

  it("does not expose other users' recipes", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const r = await createRecipe(a.user.id, { name: "Private", servings: 1, ingredients: [{ name: "x", grams: 10, quantity: 1, unitLabel: "g" }] });
    await expect(recipeWithNutrition(b.user.id, r.id)).rejects.toMatchObject({ status: 404 });
  });
});
