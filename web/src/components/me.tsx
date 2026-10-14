"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { fetcher } from "@/lib/api";
import { translate, type Lang, type MsgKey } from "@/lib/i18n";
import type { UnitSystem } from "@/lib/units";

// Mirrors the shape returned by GET /api/me (src/server/services/profile.ts#getMe).
export type Me = {
  id: string;
  email: string;
  name: string | null;
  totpEnabled: boolean;
  createdAt: string;
  profile: {
    birthYear: number | null;
    sex: string | null;
    heightCm: number | null;
    weightKg: number | null;
    activityLevel: string | null;
    experience: string | null;
    units: UnitSystem;
    country: string | null;
    language: Lang;
    timezone: string;
    onboardingComplete: boolean;
    isMinor: boolean;
  };
  targets: {
    calorieTarget: number | null;
    proteinTargetG: number | null;
    carbTargetG: number | null;
    fatTargetG: number | null;
    fiberTargetG: number | null;
    waterTargetMl: number;
    stepTarget: number | null;
    sleepTargetMin: number | null;
    workoutsPerWeek: number | null;
    targetsSource: "calculated" | "custom";
  };
  energy:
    | { ok: true; age: number; isMinor: boolean; bmr: number; maintenance: number; target: number; adjustmentNote: string; proteinG: number; fatG: number; carbsG: number; fiberG: number; waterMl: number; method: string }
    | { ok: false; reason: string; missing: string[] };
  preferences: {
    goals: string[];
    dietPattern: string;
    allergies: string[];
    dislikes: string[];
    likes: string[];
    cuisines: string[];
    cookingSkill: string | null;
    mealsPerDay: number | null;
    budget: string | null;
    cookingTimeMin: number | null;
    gymAccess: boolean;
    homeWorkouts: boolean;
    equipment: string[];
    workoutDaysPerWeek: number | null;
    workoutDurationMin: number | null;
    trainingDays: number[];
    preferredSports: string[];
    bedtime: string | null;
    wakeTime: string | null;
    waterHabit: string | null;
    scheduleNotes: string | null;
    limitations: string | null;
    travelMode: boolean;
  };
  settings: {
    aiEnabled: boolean;
    aiDataAccess: string[];
    aiSaveConversations: boolean;
    dailyInsight: boolean;
    weeklyReview: boolean;
    gamification: boolean;
    notifications: boolean;
    reminders: { type: string; time: string; enabled: boolean }[];
    trackingCategories: string[];
    dashboardWidgets: string[];
    showMicronutrients: boolean;
    reducedMotion: boolean;
    theme: string;
  };
};

type Ctx = { me: Me; mutate: KeyedMutator<Me>; t: (k: MsgKey) => string; units: UnitSystem; lang: Lang };
const MeCtx = createContext<Ctx | null>(null);

export function useMeQuery() {
  return useSWR<Me>("/api/me", fetcher, { revalidateOnFocus: false });
}

export function MeProvider({ me, mutate, children }: { me: Me; mutate: KeyedMutator<Me>; children: ReactNode }) {
  const lang = me.profile.language ?? "en";
  // Apply display preferences to <html>.
  useEffect(() => {
    const el = document.documentElement;
    if (me.settings.theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", me.settings.theme);
    el.setAttribute("data-reduced-motion", String(me.settings.reducedMotion));
    el.lang = lang;
  }, [me.settings.theme, me.settings.reducedMotion, lang]);
  return <MeCtx.Provider value={{ me, mutate, t: (k) => translate(lang, k), units: me.profile.units, lang }}>{children}</MeCtx.Provider>;
}

export function useMe() {
  const ctx = useContext(MeCtx);
  if (!ctx) throw new Error("useMe must be used within MeProvider");
  return ctx;
}
