import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addEntry } from "@/server/services/diary";
import { dataInventory, deleteAccount, deleteCategory, exportData } from "@/server/services/privacy";
import { getMe, updatePreferences, updateProfile } from "@/server/services/profile";
import { makeUser } from "./helpers";

async function seedData(userId: string) {
  const apple = await db.food.findFirstOrThrow({ where: { name: "Apple, raw" } });
  await addEntry(userId, { kind: "food", foodId: apple.id, grams: 100, quantity: 1, unitLabel: "g", date: "2026-10-11", mealType: "snack", source: "search" });
  await db.waterEntry.create({ data: { userId, date: "2026-10-11", amountMl: 250 } });
  await updatePreferences(userId, { limitations: "Sore left knee", goals: ["strength"] });
}

describe("profile & targets", () => {
  it("recalculates estimated targets when the profile changes, and encrypts limitations", async () => {
    const { user } = await makeUser();
    await updateProfile(user.id, { birthYear: 1995, sex: "male", heightCm: 180, weightKg: 80, activityLevel: "moderate" });
    const me = await getMe(user.id);
    expect(me.targets.calorieTarget).toBeGreaterThan(2000);
    expect(me.targets.targetsSource).toBe("calculated");
    await updatePreferences(user.id, { limitations: "Sore left knee" });
    const raw = await db.preferences.findUniqueOrThrow({ where: { userId: user.id } });
    expect(raw.limitationsEnc).not.toContain("knee");
    expect((await getMe(user.id)).preferences.limitations).toBe("Sore left knee");
  });

  it("gives minors no calorie deficit even with a body-composition goal", async () => {
    const { user } = await makeUser();
    await updateProfile(user.id, { birthYear: new Date().getFullYear() - 15, sex: "female", heightCm: 160, weightKg: 55, activityLevel: "active" });
    await updatePreferences(user.id, { goals: ["body_composition"] });
    const me = await getMe(user.id);
    expect(me.profile.isMinor).toBe(true);
    expect(me.energy.ok && me.energy.target).toBeGreaterThanOrEqual(me.energy.ok ? me.energy.maintenance - 5 : 0);
  });
});

describe("data control", () => {
  it("exports the user's data without secrets and with decrypted notes", async () => {
    const { user } = await makeUser();
    await seedData(user.id);
    const out = await exportData(user.id);
    const json = JSON.stringify(out);
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("scrypt$");
    expect(out.foodLogs).toHaveLength(1);
    expect(out.preferences?.limitations).toBe("Sore left knee");
  });

  it("deletes a single category without touching the rest", async () => {
    const { user } = await makeUser();
    await seedData(user.id);
    await deleteCategory(user.id, "hydration");
    const inv = Object.fromEntries((await dataInventory(user.id)).map((c) => [c.key, c.records]));
    expect(inv.hydration).toBe(0);
    expect(inv.nutrition).toBe(1);
  });

  it("deletes the account and every related record (cascade)", async () => {
    const { user, password } = await makeUser();
    await seedData(user.id);
    await expect(deleteAccount(user.id, "wrong password")).rejects.toMatchObject({ status: 400 });
    await deleteAccount(user.id, password);
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await db.foodLogEntry.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.waterEntry.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.preferences.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });
});
