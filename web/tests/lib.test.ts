import { describe, expect, it } from "vitest";
import { plausiblePer100, recipeNutrition, scaleNutrients, sumNutrients } from "@/lib/nutrition";
import { estimateEnergy } from "@/lib/energy";
import { cmToFtIn, formatPace, ftInToCm, haversineM, kgToLb, lbToKg } from "@/lib/units";
import { classifyScan, gs1CheckDigitValid, upcEToUpcA } from "@/lib/barcode";
import { addDays, dateRange, isDateStr, todayIn, weekStart } from "@/lib/dates";
import { normalize } from "@/lib/text";
import { totpCode, verifyTotp, base32Decode, base32Encode } from "@/server/auth/totp";

describe("nutrition math", () => {
  it("scales per-100 g values and keeps unknowns as null", () => {
    const n = scaleNutrients({ kcal: 52, proteinG: 0.3, fiberG: null }, 182, ["kcal", "proteinG", "fiberG"]);
    expect(n.kcal).toBe(95);
    expect(n.proteinG).toBeCloseTo(0.55, 2);
    expect(n.fiberG).toBeNull();
  });

  it("sums totals and counts missing values instead of hiding them", () => {
    const t = sumNutrients([{ kcal: 100, fiberG: 2 }, { kcal: 50, fiberG: null }], ["kcal", "fiberG"]);
    expect(t.values.kcal).toBe(150);
    expect(t.values.fiberG).toBe(2);
    expect(t.missing.fiberG).toBe(1);
    expect(t.missing.kcal).toBe(0);
  });

  it("computes recipe totals, per-serving values and completeness", () => {
    const r = recipeNutrition(
      [
        { grams: 200, per100: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 } }, // chicken
        { grams: 100, per100: { kcal: 371, proteinG: 13, carbsG: 74.7, fatG: 1.5 } }, // dry pasta
        { grams: 10, per100: null }, // unknown spice
      ],
      2,
    );
    expect(r.total.values.kcal).toBe(330 + 371);
    expect(r.perServing.kcal).toBe(Math.round((330 + 371) / 2));
    expect(r.perServing.proteinG).toBeCloseTo((62 + 13) / 2, 1);
    expect(r.complete).toBe(false);
    expect(r.unlinkedIngredients).toBe(1);
    expect(r.gramsPerServing).toBe(155);
  });

  it("rejects implausible nutrition profiles", () => {
    expect(plausiblePer100({ kcal: 100, proteinG: 60, carbsG: 60, fatG: 0 }).ok).toBe(false);
    expect(plausiblePer100({ kcal: 1200 }).ok).toBe(false);
    expect(plausiblePer100({ kcal: 884, fatG: 100 }).ok).toBe(true);
  });
});

describe("energy estimate", () => {
  const adult = { birthYear: 1990, sex: "female", heightCm: 165, weightKg: 60, activityLevel: "moderate", currentYear: 2026 };

  it("returns null with a reason when data is missing", () => {
    const e = estimateEnergy({ heightCm: 170 });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.missing).toEqual(expect.arrayContaining(["age", "weight", "activity level"]));
  });

  it("uses Mifflin–St Jeor × activity factor", () => {
    const e = estimateEnergy(adult);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const bmr = 10 * 60 + 6.25 * 165 - 5 * 36 - 161;
    expect(e.bmr).toBe(Math.round(bmr));
    expect(e.maintenance).toBe(Math.round(bmr * 1.55));
  });

  it("applies at most a modest adjustment for adults with a body-composition goal", () => {
    const e = estimateEnergy({ ...adult, goals: ["body_composition"] });
    if (!e.ok) throw new Error("expected ok");
    expect(e.target).toBeGreaterThanOrEqual(Math.round((e.maintenance * 0.9) / 10) * 10 - 10);
    expect(e.target).toBeGreaterThan(e.bmr);
  });

  it("never applies a deficit for under-18s", () => {
    const e = estimateEnergy({ ...adult, birthYear: 2010, goals: ["body_composition"] });
    if (!e.ok) throw new Error("expected ok");
    expect(e.isMinor).toBe(true);
    // Target equals maintenance (only rounded to the nearest 10 kcal) — no deficit.
    expect(Math.abs(e.target - e.maintenance)).toBeLessThanOrEqual(5);
    expect(e.adjustmentNote).toMatch(/under 18/);
  });

  it("does not estimate for children under 13", () => {
    expect(estimateEnergy({ ...adult, birthYear: 2018 }).ok).toBe(false);
  });
});

describe("units", () => {
  it("round-trips weight and height", () => {
    expect(lbToKg(kgToLb(80))).toBeCloseTo(80, 6);
    const h = cmToFtIn(180);
    expect(h).toEqual({ ft: 5, in: 11 });
    expect(ftInToCm(5, 11)).toBeCloseTo(180.34, 1);
  });
  it("formats pace", () => {
    expect(formatPace(5000, 25, "metric")).toBe("5:00 /km");
  });
  it("computes haversine distance", () => {
    // ~1 degree of latitude ≈ 111 km
    expect(haversineM(0, 0, 1, 0) / 1000).toBeCloseTo(111.2, 0);
  });
});

describe("barcode classification", () => {
  it("validates GS1 check digits", () => {
    expect(gs1CheckDigitValid("3017624010701")).toBe(true); // Nutella EAN-13
    expect(gs1CheckDigitValid("3017624010702")).toBe(false);
    expect(gs1CheckDigitValid("96385074")).toBe(true); // EAN-8
    expect(gs1CheckDigitValid("036000291452")).toBe(true); // UPC-A
  });
  it("expands UPC-E", () => {
    expect(upcEToUpcA("04252614")).toBe("042100005264");
  });
  it("classifies product barcodes, GS1 Digital Link QR codes and arbitrary QR codes", () => {
    expect(classifyScan("3017624010701")).toMatchObject({ kind: "product", format: "EAN-13", fromQr: false });
    expect(classifyScan("3017624010700")).toMatchObject({ kind: "invalid_barcode" });
    expect(classifyScan("https://id.gs1.org/01/03017624010701")).toMatchObject({ kind: "product", gtin: "3017624010701", fromQr: true });
    expect(classifyScan("https://example.com/menu")).toEqual({ kind: "url", url: "https://example.com/menu" });
    expect(classifyScan("hello")).toEqual({ kind: "text", text: "hello" });
  });
});

describe("dates", () => {
  it("validates and does arithmetic on calendar days across DST and month ends", () => {
    expect(isDateStr("2026-02-29")).toBe(false);
    expect(isDateStr("2028-02-29")).toBe(true);
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dateRange("2026-01-30", "2026-02-02")).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday → previous Monday
  });
  it("computes today in a timezone", () => {
    const instant = new Date("2026-10-11T23:30:00Z");
    expect(todayIn("UTC", instant)).toBe("2026-10-11");
    expect(todayIn("Europe/Tirane", instant)).toBe("2026-10-12");
    expect(todayIn("America/New_York", instant)).toBe("2026-10-11");
    expect(todayIn("Not/AZone", instant)).toBe("2026-10-11");
  });
});

describe("text normalisation", () => {
  it("strips diacritics for search", () => {
    expect(normalize("Fërgesë")).toBe("fergese");
    expect(normalize("  Çaj  ")).toBe("caj");
  });
});

describe("TOTP", () => {
  it("matches RFC 6238 test vector (SHA-1)", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    // RFC 6238: T=59s → 94287082 (8 digits) → last 6 digits 287082
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotp(secret, "000000", 59_000)).toBe(false);
  });
});

import { AppleHealthAggregator, parseHkDate } from "@/lib/apple-health";
describe("Apple Health export aggregation", () => {
  it("does not double count steps from iPhone + Watch, merges sleep intervals, skips in-bed", () => {
    const a = new AppleHealthAggregator();
    const lines = [
      `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-10-10 08:00:00 +0200" endDate="2026-10-10 08:10:00 +0200" value="1000"/>`,
      `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-10-10 12:00:00 +0200" endDate="2026-10-10 12:10:00 +0200" value="2000"/>`,
      `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Watch" unit="count" startDate="2026-10-10 08:00:00 +0200" endDate="2026-10-10 08:10:00 +0200" value="2800"/>`,
      `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-09 23:00:00 +0200" endDate="2026-10-10 03:00:00 +0200" value="HKCategoryValueSleepAnalysisAsleepCore"/>`,
      `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-10 02:00:00 +0200" endDate="2026-10-10 06:30:00 +0200" value="HKCategoryValueSleepAnalysisAsleepDeep"/>`,
      `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone" startDate="2026-10-09 22:00:00 +0200" endDate="2026-10-10 07:00:00 +0200" value="HKCategoryValueSleepAnalysisInBed"/>`,
      `<Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" startDate="2026-10-10 09:00:00 +0200" endDate="2026-10-10 09:00:00 +0200" value="56"/>`,
    ];
    lines.forEach((l) => a.line(l));
    const r = a.result();
    expect(r.steps).toEqual([{ date: "2026-10-10", value: 3000 }]);
    expect(r.sleep[0]).toMatchObject({ date: "2026-10-10", durationMin: 450 });
    expect(r.restingHr).toEqual([{ date: "2026-10-10", value: 56 }]);
    expect(parseHkDate("2026-10-10 08:00:00 +0200")).toBe(Date.parse("2026-10-10T06:00:00Z"));
  });
});
