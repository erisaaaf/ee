// Calorie & target ESTIMATES. These are population-level equations — never exact measurements.
// Safety rules:
//   * Under-18s never receive an energy deficit; targets focus on balanced nourishment.
//   * Adults with a body-composition goal get at most a modest adjustment (−10%), never below estimated BMR.
//   * If required data is missing we return null with a reason instead of guessing.

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export const ACTIVITY_FACTORS: Record<ActivityLevel, { factor: number; label: string; description: string }> = {
  sedentary: { factor: 1.2, label: "Mostly sitting", description: "Desk job, little exercise" },
  light: { factor: 1.375, label: "Lightly active", description: "Light exercise 1–3 days/week or on your feet some of the day" },
  moderate: { factor: 1.55, label: "Moderately active", description: "Exercise 3–5 days/week" },
  active: { factor: 1.725, label: "Very active", description: "Hard exercise 6–7 days/week" },
  very_active: { factor: 1.9, label: "Extremely active", description: "Physical job plus training" },
};

export type EnergyInput = {
  birthYear?: number | null;
  sex?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: string | null;
  goals?: string[];
  currentYear?: number;
};

export type EnergyEstimate =
  | {
      ok: true;
      age: number;
      isMinor: boolean;
      bmr: number;
      maintenance: number;
      target: number;
      adjustmentNote: string;
      proteinG: number;
      fatG: number;
      carbsG: number;
      fiberG: number;
      waterMl: number;
      method: string;
    }
  | { ok: false; reason: string; missing: string[] };

export function ageFromBirthYear(birthYear: number, currentYear = new Date().getFullYear()) {
  return currentYear - birthYear;
}

export function estimateEnergy(input: EnergyInput): EnergyEstimate {
  const missing: string[] = [];
  if (!input.birthYear) missing.push("age");
  if (!input.heightCm) missing.push("height");
  if (!input.weightKg) missing.push("weight");
  if (!input.activityLevel) missing.push("activity level");
  if (missing.length) {
    return { ok: false, reason: `Add your ${missing.join(", ")} to get an estimate. You can also set your own targets.`, missing };
  }
  const age = ageFromBirthYear(input.birthYear!, input.currentYear);
  if (age < 13) {
    return {
      ok: false,
      reason: "Energy estimates aren't provided for children under 13. Growing bodies have individual needs — a doctor or dietitian can advise.",
      missing: [],
    };
  }
  const w = input.weightKg!;
  const h = input.heightCm!;
  // Mifflin–St Jeor. For "other"/unspecified sex we use the midpoint of the two constants.
  const sexConst = input.sex === "male" ? 5 : input.sex === "female" ? -161 : -78;
  const bmr = 10 * w + 6.25 * h - 5 * age + sexConst;
  const level = (input.activityLevel as ActivityLevel) in ACTIVITY_FACTORS ? (input.activityLevel as ActivityLevel) : "light";
  const maintenance = bmr * ACTIVITY_FACTORS[level].factor;
  const isMinor = age < 18;

  let target = maintenance;
  let adjustmentNote = "Estimated maintenance — roughly the energy to keep your current weight with your activity level.";
  const goals = input.goals ?? [];
  if (goals.includes("body_composition") && !isMinor) {
    target = Math.max(maintenance * 0.9, bmr * 1.1);
    adjustmentNote =
      "Includes a gentle adjustment for your body-composition goal. Slow, sustainable changes work best — this is not a strict limit.";
  } else if (goals.includes("body_composition") && isMinor) {
    adjustmentNote =
      "For people under 18 we don't suggest eating less than you need. Focus on balanced meals, activity you enjoy and good sleep.";
  }

  const strength = goals.includes("strength") || goals.includes("sports_performance");
  const proteinPerKg = isMinor ? 1.0 : strength ? 1.6 : 1.2;
  const proteinG = Math.round(w * proteinPerKg);
  const fatG = Math.round((target * 0.3) / 9);
  const carbsG = Math.max(0, Math.round((target - proteinG * 4 - fatG * 9) / 4));
  const fiberG = Math.round((target / 1000) * 14);
  const waterMl = Math.round(Math.min(Math.max(w * 33, 1500), 4000) / 50) * 50;

  return {
    ok: true,
    age,
    isMinor,
    bmr: Math.round(bmr),
    maintenance: Math.round(maintenance),
    target: Math.round(target / 10) * 10,
    adjustmentNote,
    proteinG,
    fatG,
    carbsG,
    fiberG,
    waterMl,
    method: "Mifflin–St Jeor equation × activity factor (population estimate, typically ±10–20% for an individual)",
  };
}
