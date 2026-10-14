import "server-only";
import type { z } from "zod";
import { db } from "../db";
import { decryptOptional, encryptOptional } from "../crypto";
import { estimateEnergy } from "@/lib/energy";
import type { preferencesSchema, profileSchema, settingsSchema, targetsSchema } from "@/lib/validation";

export const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
export const asNumbers = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []);

async function ensureRows(userId: string) {
  await db.profile.upsert({ where: { userId }, create: { userId }, update: {} });
  await db.preferences.upsert({ where: { userId }, create: { userId }, update: {} });
  await db.settings.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function getMe(userId: string) {
  await ensureRows(userId);
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { profile: true, preferences: true, settings: true },
  });
  const profile = user.profile!;
  const prefs = user.preferences!;
  const settings = user.settings!;
  const goals = asStrings(prefs.goals);
  const energy = estimateEnergy({ ...profile, goals });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    totpEnabled: user.totpEnabled,
    createdAt: user.createdAt,
    profile: {
      birthYear: profile.birthYear,
      sex: profile.sex,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      activityLevel: profile.activityLevel,
      experience: profile.experience,
      units: profile.units as "metric" | "imperial",
      country: profile.country,
      language: profile.language as "en" | "sq" | "de",
      timezone: profile.timezone,
      onboardingComplete: profile.onboardingComplete,
      isMinor: energy.ok ? energy.isMinor : profile.birthYear ? new Date().getFullYear() - profile.birthYear < 18 : false,
    },
    targets: {
      calorieTarget: profile.calorieTarget,
      proteinTargetG: profile.proteinTargetG,
      carbTargetG: profile.carbTargetG,
      fatTargetG: profile.fatTargetG,
      fiberTargetG: profile.fiberTargetG,
      waterTargetMl: profile.waterTargetMl,
      stepTarget: profile.stepTarget,
      sleepTargetMin: profile.sleepTargetMin,
      workoutsPerWeek: profile.workoutsPerWeek,
      targetsSource: profile.targetsSource as "calculated" | "custom",
    },
    energy,
    preferences: {
      goals,
      dietPattern: prefs.dietPattern,
      allergies: asStrings(prefs.allergies),
      dislikes: asStrings(prefs.dislikes),
      likes: asStrings(prefs.likes),
      cuisines: asStrings(prefs.cuisines),
      cookingSkill: prefs.cookingSkill,
      mealsPerDay: prefs.mealsPerDay,
      budget: prefs.budget,
      cookingTimeMin: prefs.cookingTimeMin,
      gymAccess: prefs.gymAccess,
      homeWorkouts: prefs.homeWorkouts,
      equipment: asStrings(prefs.equipment),
      workoutDaysPerWeek: prefs.workoutDaysPerWeek,
      workoutDurationMin: prefs.workoutDurationMin,
      trainingDays: asNumbers(prefs.trainingDays),
      preferredSports: asStrings(prefs.preferredSports),
      bedtime: prefs.bedtime,
      wakeTime: prefs.wakeTime,
      waterHabit: prefs.waterHabit,
      scheduleNotes: prefs.scheduleNotes,
      limitations: decryptOptional(prefs.limitationsEnc),
      travelMode: prefs.travelMode,
    },
    settings: {
      aiEnabled: settings.aiEnabled,
      aiDataAccess: asStrings(settings.aiDataAccess),
      aiSaveConversations: settings.aiSaveConversations,
      dailyInsight: settings.dailyInsight,
      weeklyReview: settings.weeklyReview,
      gamification: settings.gamification,
      notifications: settings.notifications,
      reminders: (Array.isArray(settings.reminders) ? settings.reminders : []) as { type: string; time: string; enabled: boolean }[],
      trackingCategories: asStrings(settings.trackingCategories),
      dashboardWidgets: asStrings(settings.dashboardWidgets),
      showMicronutrients: settings.showMicronutrients,
      reducedMotion: settings.reducedMotion,
      theme: settings.theme,
    },
  };
}
export type Me = Awaited<ReturnType<typeof getMe>>;

/** Recompute estimated targets when the user hasn't chosen custom ones. */
export async function recalcTargets(userId: string) {
  const profile = await db.profile.findUniqueOrThrow({ where: { userId } });
  const prefs = await db.preferences.findUnique({ where: { userId } });
  const goals = asStrings(prefs?.goals);
  const update: Record<string, number | null> = {};
  if (profile.targetsSource === "calculated") {
    const e = estimateEnergy({ ...profile, goals });
    Object.assign(update, {
      calorieTarget: e.ok ? e.target : null,
      proteinTargetG: e.ok ? e.proteinG : null,
      carbTargetG: e.ok ? e.carbsG : null,
      fatTargetG: e.ok ? e.fatG : null,
      fiberTargetG: e.ok ? e.fiberG : null,
      waterTargetMl: e.ok ? e.waterMl : profile.waterTargetMl,
    });
  }
  // Sensible, editable defaults for habit targets if not set yet.
  if (profile.stepTarget == null) update.stepTarget = 7000;
  if (profile.sleepTargetMin == null) update.sleepTargetMin = 480;
  if (profile.workoutsPerWeek == null) update.workoutsPerWeek = prefs?.workoutDaysPerWeek ?? 3;
  if (Object.keys(update).length) await db.profile.update({ where: { userId }, data: update });
}

export async function updateProfile(userId: string, input: z.infer<typeof profileSchema>) {
  await ensureRows(userId);
  const { name, ...profile } = input;
  if (name !== undefined) await db.user.update({ where: { id: userId }, data: { name } });
  await db.profile.update({ where: { userId }, data: profile });
  await recalcTargets(userId);
}

export async function updatePreferences(userId: string, input: z.infer<typeof preferencesSchema>) {
  await ensureRows(userId);
  const { limitations, ...rest } = input;
  await db.preferences.update({
    where: { userId },
    data: { ...rest, ...(limitations !== undefined ? { limitationsEnc: encryptOptional(limitations) } : {}) },
  });
  if (input.goals || input.workoutDaysPerWeek !== undefined) await recalcTargets(userId);
}

export async function updateTargets(userId: string, input: z.infer<typeof targetsSchema>) {
  await ensureRows(userId);
  await db.profile.update({ where: { userId }, data: input });
  if (input.targetsSource === "calculated") await recalcTargets(userId);
}

export async function updateSettings(userId: string, input: z.infer<typeof settingsSchema>) {
  await ensureRows(userId);
  await db.settings.update({ where: { userId }, data: input });
}

export async function completeOnboarding(userId: string) {
  await ensureRows(userId);
  await db.profile.update({ where: { userId }, data: { onboardingComplete: true } });
  await recalcTargets(userId);
}
