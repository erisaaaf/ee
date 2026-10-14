import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { allergenConflicts, dietConflicts } from "@/lib/allergens";
import { aiStatus, guardAi } from "@/server/ai/provider";
import { runTool } from "@/server/ai/tools";
import { resolvePendingAction, chat } from "@/server/ai/chat";
import { decodeImage, analyzeFoodPhoto } from "@/server/ai/features";
import { waterDay } from "@/server/services/wellness";
import { dayDiary } from "@/server/services/diary";
import { importAppleHealth, importGpx, parseGpx, setConsent, disconnect, listIntegrations } from "@/server/services/integrations";
import { stepsRange, sleepRange } from "@/server/services/wellness";
import { swapsForFood } from "@/server/services/swaps";
import { globalSearch } from "@/server/services/search";
import { updatePreferences } from "@/server/services/profile";
import { makeUser } from "./helpers";

describe("AI availability (no API key in tests)", () => {
  it("reports not configured and refuses honestly instead of faking answers", async () => {
    const { user } = await makeUser();
    expect(await aiStatus(user.id)).toMatchObject({ configured: false, model: null });
    await expect(guardAi(user.id, "chat")).rejects.toMatchObject({ status: 503, code: "ai_not_configured" });
    await expect(chat(user.id, { message: "hi" })).rejects.toMatchObject({ code: "ai_not_configured" });
  });

  it("respects the user's AI off switch first", async () => {
    const { user } = await makeUser();
    await db.settings.update({ where: { userId: user.id }, data: { aiEnabled: false } });
    await expect(guardAi(user.id, "chat")).rejects.toMatchObject({ status: 403, code: "ai_disabled" });
  });

  it("validates uploaded images by content, not by declared type", async () => {
    expect(() => decodeImage("data:image/png;base64," + Buffer.from("not an image").toString("base64"))).toThrow(/supported image/);
    expect(() => decodeImage("data:text/html;base64,AAAA")).toThrow(/JPEG, PNG or WebP/);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(decodeImage("data:image/jpeg;base64," + png.toString("base64")).mediaType).toBe("image/png");
    const { user } = await makeUser();
    await expect(analyzeFoodPhoto(user.id, "data:image/png;base64," + png.toString("base64"))).rejects.toMatchObject({ code: "ai_not_configured" });
  });
});

describe("AI tool layer", () => {
  it("denies data categories the user hasn't authorised", async () => {
    const { user } = await makeUser();
    const out = (await runTool({ userId: user.id, today: "2026-10-11", access: new Set(["profile"]) }, "get_nutrition_day", { date: null })) as { error: string };
    expect(out.error).toBe("access_denied");
    const bad = (await runTool({ userId: user.id, today: "2026-10-11", access: new Set() }, "get_hydration", { days: "x" })) as { error: string };
    expect(bad.error).toBe("invalid_input");
  });

  it("proposals change nothing until confirmed; rejected/duplicate decisions are blocked", async () => {
    const { user } = await makeUser();
    const ctx = { userId: user.id, today: "2026-10-11", access: new Set<string>() };
    const p = (await runTool(ctx, "propose_log_water", { amountMl: 300, date: "2026-10-11" })) as { pendingActionId: string; status: string };
    expect(p.status).toBe("awaiting_user_confirmation");
    expect((await waterDay(user.id, "2026-10-11")).totalMl).toBe(0);
    await resolvePendingAction(user.id, p.pendingActionId, "confirm");
    expect((await waterDay(user.id, "2026-10-11")).totalMl).toBe(300);
    await expect(resolvePendingAction(user.id, p.pendingActionId, "confirm")).rejects.toMatchObject({ status: 400 });

    const apple = await db.food.findFirstOrThrow({ where: { name: "Apple, raw" } });
    const f = (await runTool(ctx, "propose_log_food", { foodId: apple.id, grams: 150, mealType: "snack", date: null })) as { pendingActionId: string };
    await resolvePendingAction(user.id, f.pendingActionId, "reject");
    expect((await dayDiary(user.id, "2026-10-11")).entryCount).toBe(0);
    const invented = (await runTool(ctx, "propose_log_food", { foodId: "made-up", grams: 150, mealType: "snack", date: null })) as { error: string };
    expect(invented.error).toBe("unknown_food");
  });

  it("another user cannot confirm someone else's proposal", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const p = (await runTool({ userId: a.user.id, today: "2026-10-11", access: new Set() }, "propose_log_water", { amountMl: 200, date: null })) as { pendingActionId: string };
    await expect(resolvePendingAction(b.user.id, p.pendingActionId, "confirm")).rejects.toMatchObject({ status: 404 });
  });

  it("rejects unsafe or unknown workout proposals", async () => {
    const { user } = await makeUser();
    const ctx = { userId: user.id, today: "2026-10-11", access: new Set<string>() };
    const unknown = (await runTool(ctx, "propose_save_workout", { name: "x", location: "home", items: [{ slug: "made-up-move", sets: 3, reps: 10, durationSec: null, restSec: 60 }] })) as { error: string };
    expect(unknown.error).toBe("unknown_exercises");
    const heavy = (await runTool(ctx, "propose_save_workout", { name: "x", location: "home", items: [{ slug: "push-up", sets: 20, reps: 10, durationSec: null, restSec: 60 }] })) as { error: string };
    expect(heavy.error).toBe("unsafe_volume");
  });
});

describe("allergen & diet screening", () => {
  it("flags allergens in ingredient names", () => {
    expect(allergenConflicts(["Feta cheese", "Tomato"], ["dairy"])).toEqual([{ allergen: "dairy", ingredient: "Feta cheese" }]);
    expect(allergenConflicts(["Coconut milk"], ["dairy"])).toEqual([]);
    expect(allergenConflicts(["Tahini dressing"], ["sesame"])).toHaveLength(1);
    expect(allergenConflicts(["Wholewheat pasta"], ["gluten"])).toHaveLength(1);
    expect(allergenConflicts(["Kiwi"], ["kiwi"])).toHaveLength(1); // custom allergy matched literally
  });
  it("flags diet conflicts", () => {
    expect(dietConflicts(["Chicken breast", "Rice"], "vegetarian")).toEqual(["Chicken breast"]);
    expect(dietConflicts(["Greek yogurt"], "vegan")).toEqual(["Greek yogurt"]);
    expect(dietConflicts(["Oat milk"], "vegan")).toEqual([]);
  });
});

describe("integrations", () => {
  const gpx = `<?xml version="1.0"?><gpx><trk><name>Morning run</name><type>running</type><trkseg>
${Array.from({ length: 21 }, (_, i) => `<trkpt lat="${(42.6629 + i * 0.0005).toFixed(5)}" lon="21.1655"><ele>${600 + i}</ele><time>2026-10-10T07:${String(i).padStart(2, "0")}:00Z</time></trkpt>`).join("\n")}
</trkseg></trk></gpx>`;

  it("parses GPX and imports it as an activity (deduplicated)", async () => {
    expect(parseGpx(gpx).points).toHaveLength(21);
    const { user } = await makeUser();
    const r = await importGpx(user.id, gpx);
    expect(r.duplicate).toBe(false);
    expect(r.activity).toMatchObject({ type: "running", durationMin: 20, source: "import", date: "2026-10-10" });
    expect(r.activity.distanceM).toBeGreaterThan(1000);
    expect((await importGpx(user.id, gpx)).duplicate).toBe(true);
    await expect(importGpx(user.id, "<gpx></gpx>")).rejects.toMatchObject({ status: 400 });
  });

  it("imports only the Apple Health categories the user consented to, and can delete them", async () => {
    const { user } = await makeUser();
    const payload = {
      steps: [{ date: "2026-10-10", value: 8432 }],
      restingHr: [{ date: "2026-10-10", value: 58 }],
      sleep: [{ date: "2026-10-10", bedtime: "2026-10-09T22:30:00.000Z", wakeTime: "2026-10-10T06:30:00.000Z", durationMin: 480 }],
    };
    await expect(importAppleHealth(user.id, payload)).rejects.toMatchObject({ status: 400 }); // not connected yet
    await setConsent(user.id, "apple_health_import", ["steps"]);
    const res = await importAppleHealth(user.id, payload);
    expect(res).toMatchObject({ steps: 1, sleep: 0, skipped: { sleep: true } });
    expect((await stepsRange(user.id, "2026-10-10", "2026-10-10"))[0]).toMatchObject({ steps: 8432, source: "import:apple_health" });
    expect((await sleepRange(user.id, "2026-10-10", "2026-10-10"))[0].logged).toBe(false);
    await expect(setConsent(user.id, "fitbit", ["steps"])).rejects.toMatchObject({ status: 400 }); // needs credentials, not faked
    await disconnect(user.id, "apple_health_import", true);
    expect((await stepsRange(user.id, "2026-10-10", "2026-10-10"))[0].steps).toBeNull();
    const list = await listIntegrations(user.id);
    expect(list.find((p) => p.key === "health_connect")?.status).toBe("requires_native_app");
  });
});

describe("swaps & search", () => {
  it("suggests database-backed swaps that respect allergies", async () => {
    const { user } = await makeUser();
    await updatePreferences(user.id, { allergies: ["gluten"] });
    const white = await db.food.findFirstOrThrow({ where: { name: "White rice, cooked" } });
    const s = await swapsForFood(user.id, white.id);
    expect(s.suggestions.length).toBeGreaterThan(0);
    expect(s.suggestions.every((x) => !/bulgur|couscous|pasta|bread/i.test(x.food.name))).toBe(true);
    expect(s.suggestions[0].why).toMatch(/per 100 g/);
    expect(JSON.stringify(s)).not.toMatch(/\b(bad|unhealthy|junk)\b/i);
  });

  it("searches across foods, exercises and sports", async () => {
    const { user } = await makeUser();
    const r = await globalSearch(user.id, "squat");
    expect(r.groups.find((g) => g.key === "exercises")?.items.length).toBeGreaterThan(0);
    const s = await globalSearch(user.id, "football");
    expect(s.groups.find((g) => g.key === "sports")).toBeTruthy();
  });
});
