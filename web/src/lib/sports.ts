// Sport definitions: which metrics make sense for each activity (the UI shows only these).
export type SportMetric = "distance" | "pace" | "speed" | "elevation" | "steps" | "heartRate" | "calories" | "intensity";

export const SPORTS: Record<string, { label: string; metrics: SportMetric[]; gps: boolean; emoji: string }> = {
  running: { label: "Running", metrics: ["distance", "pace", "elevation", "heartRate", "calories", "steps", "intensity"], gps: true, emoji: "🏃" },
  walking: { label: "Walking", metrics: ["distance", "pace", "steps", "elevation", "heartRate", "calories", "intensity"], gps: true, emoji: "🚶" },
  cycling: { label: "Cycling", metrics: ["distance", "speed", "elevation", "heartRate", "calories", "intensity"], gps: true, emoji: "🚴" },
  swimming: { label: "Swimming", metrics: ["distance", "pace", "heartRate", "calories", "intensity"], gps: false, emoji: "🏊" },
  hiking: { label: "Hiking", metrics: ["distance", "elevation", "pace", "steps", "heartRate", "calories", "intensity"], gps: true, emoji: "🥾" },
  football: { label: "Football", metrics: ["distance", "heartRate", "calories", "intensity"], gps: false, emoji: "⚽" },
  basketball: { label: "Basketball", metrics: ["heartRate", "calories", "intensity"], gps: false, emoji: "🏀" },
  volleyball: { label: "Volleyball", metrics: ["heartRate", "calories", "intensity"], gps: false, emoji: "🏐" },
  tennis: { label: "Tennis", metrics: ["heartRate", "calories", "intensity"], gps: false, emoji: "🎾" },
  skiing: { label: "Skiing", metrics: ["distance", "elevation", "speed", "heartRate", "calories", "intensity"], gps: true, emoji: "⛷️" },
  yoga: { label: "Yoga", metrics: ["heartRate", "intensity"], gps: false, emoji: "🧘" },
  dancing: { label: "Dancing", metrics: ["heartRate", "calories", "intensity"], gps: false, emoji: "💃" },
  martial_arts: { label: "Martial arts", metrics: ["heartRate", "calories", "intensity"], gps: false, emoji: "🥋" },
  rowing: { label: "Rowing", metrics: ["distance", "pace", "heartRate", "calories", "intensity"], gps: false, emoji: "🚣" },
  custom: { label: "Other activity", metrics: ["distance", "heartRate", "calories", "intensity"], gps: false, emoji: "✨" },
};

export const sportLabel = (type: string, customName?: string | null) => (type === "custom" && customName ? customName : SPORTS[type]?.label ?? type);
