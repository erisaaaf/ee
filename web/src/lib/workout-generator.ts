// Deterministic, rule-based workout generator (works without AI).
// Safety: conservative volume (max 4 sets), rest included, optional low-impact mode,
// user-flagged exercises/areas are excluded — no diagnosis, no rehab prescription.

export type GenExercise = {
  id: string;
  slug: string;
  name: string;
  category: string;
  muscleGroups: string[];
  equipment: string[];
  difficulty: string;
  trackingType: string;
};

export type GenOptions = {
  minutes: number; // 10–120
  location: "home" | "gym";
  equipment: string[]; // available equipment keys
  level: "beginner" | "intermediate" | "advanced";
  goal: "strength" | "endurance" | "general" | "mobility";
  focus: "full" | "upper" | "lower" | "core" | "cardio" | "mobility";
  lowImpact?: boolean;
  avoidSlugs?: string[];
  avoidAreas?: string[]; // e.g. ["knees", "shoulders", "lower back"] — exercises loading these are skipped
  seed?: number;
};

export type GenItem = { exerciseId: string; slug: string; name: string; sets: number; reps: number | null; durationSec: number | null; restSec: number; block: "warmup" | "main" | "cooldown" };
export type GenPlan = { name: string; items: GenItem[]; estMinutes: number; notes: string[] };

const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;

// Which body areas an exercise mainly loads (used only to honour user-flagged areas to avoid).
const AREA_MUSCLES: Record<string, string[]> = {
  knees: ["quads"],
  shoulders: ["shoulders", "chest"],
  "lower back": ["lower back"],
  wrists: ["chest", "triceps", "shoulders"],
  hips: ["hip flexors", "glutes"],
};

const FOCUS_MUSCLES: Record<GenOptions["focus"], string[] | null> = {
  full: null,
  upper: ["chest", "back", "shoulders", "triceps", "biceps", "upper back"],
  lower: ["quads", "glutes", "hamstrings", "calves"],
  core: ["core", "obliques"],
  cardio: null,
  mobility: null,
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function canDo(ex: GenExercise, opts: Pick<GenOptions, "equipment" | "level" | "lowImpact" | "avoidSlugs" | "avoidAreas">) {
  if (!ex.equipment.every((e) => opts.equipment.includes(e))) return false;
  if (LEVEL_RANK[ex.difficulty as keyof typeof LEVEL_RANK] > LEVEL_RANK[opts.level]) return false;
  if (opts.lowImpact && (ex.category === "plyometric" || ["jumping-jack", "jump-rope", "burpee", "jump-squat", "treadmill-run"].includes(ex.slug))) return false;
  if (opts.avoidSlugs?.includes(ex.slug)) return false;
  for (const area of opts.avoidAreas ?? []) {
    const muscles = AREA_MUSCLES[area] ?? [area];
    if (ex.muscleGroups.some((m) => muscles.includes(m))) return false;
  }
  return true;
}

function prescription(goal: GenOptions["goal"], level: GenOptions["level"], ex: GenExercise) {
  const timed = ex.trackingType === "time" || ex.trackingType === "distance";
  const sets = goal === "strength" ? (level === "beginner" ? 3 : 4) : goal === "endurance" ? (level === "beginner" ? 2 : 3) : level === "beginner" ? 2 : 3;
  const reps = timed ? null : goal === "strength" ? (ex.trackingType === "weighted" ? 8 : 10) : goal === "endurance" ? 15 : 12;
  const durationSec = timed ? (goal === "endurance" ? 45 : 30) : null;
  const restSec = goal === "strength" ? 90 : goal === "endurance" ? 45 : 60;
  return { sets: Math.min(sets, 4), reps, durationSec, restSec };
}

/** Rough time for one item: work (≈3 s per rep or the hold time) + rest between sets. */
export function itemSeconds(i: Pick<GenItem, "sets" | "reps" | "durationSec" | "restSec">) {
  const work = i.durationSec ?? (i.reps ?? 10) * 3.5;
  return i.sets * work + Math.max(0, i.sets - 1) * i.restSec + 30; // +30 s setup/transition
}

export function generateWorkout(all: GenExercise[], opts: GenOptions): GenPlan {
  const rand = rng(opts.seed ?? Date.now());
  const shuffle = <T,>(arr: T[]) => arr.map((v) => [rand(), v] as const).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  const usable = all.filter((e) => canDo(e, opts));
  const notes: string[] = [];
  const budget = Math.max(10, Math.min(120, opts.minutes)) * 60;

  const warmup = shuffle(usable.filter((e) => e.category === "mobility" || (e.category === "cardio" && e.equipment.length === 0))).slice(0, 2);
  const cooldown = shuffle(usable.filter((e) => e.category === "mobility" && !warmup.includes(e))).slice(0, 1);
  const items: GenItem[] = [];
  const add = (e: GenExercise, block: GenItem["block"], override?: Partial<GenItem>) =>
    items.push({ exerciseId: e.id, slug: e.slug, name: e.name, block, ...prescription(opts.goal, opts.level, e), ...override });

  warmup.forEach((e) => add(e, "warmup", { sets: 1, reps: e.trackingType === "reps" ? 10 : null, durationSec: e.trackingType === "reps" ? null : 45, restSec: 0 }));

  let pool: GenExercise[];
  if (opts.focus === "cardio") pool = usable.filter((e) => e.category === "cardio" || e.category === "plyometric");
  else if (opts.focus === "mobility" || opts.goal === "mobility") pool = usable.filter((e) => e.category === "mobility");
  else {
    const muscles = FOCUS_MUSCLES[opts.focus];
    pool = usable.filter((e) => (e.category === "strength" || e.category === "core") && (!muscles || e.muscleGroups.some((m) => muscles.includes(m))));
  }

  // Prefer movement variety: pick at most one exercise per primary muscle before repeating.
  const used = new Set<string>();
  const ordered = shuffle(pool).sort((a, b) => Number(used.has(a.muscleGroups[0])) - Number(used.has(b.muscleGroups[0])));
  const cooldownSec = cooldown.length ? 90 : 0;
  let spent = items.reduce((s, i) => s + itemSeconds(i), 0) + cooldownSec;
  for (const e of ordered) {
    if (items.some((i) => i.slug === e.slug)) continue;
    if (used.has(e.muscleGroups[0]) && ordered.some((o) => !used.has(o.muscleGroups[0]) && !items.some((i) => i.slug === o.slug))) continue;
    const p = prescription(opts.goal, opts.level, e);
    const t = itemSeconds(p);
    if (spent + t > budget) continue;
    add(e, "main");
    used.add(e.muscleGroups[0]);
    spent += t;
    if (items.filter((i) => i.block === "main").length >= 8) break;
  }
  cooldown.forEach((e) => add(e, "cooldown", { sets: 1, reps: e.trackingType === "reps" ? 8 : null, durationSec: e.trackingType === "reps" ? null : 60, restSec: 0 }));

  if (!items.some((i) => i.block === "main")) notes.push("We couldn't fit main exercises with these settings. Try more time or more equipment options.");
  if (opts.avoidAreas?.length)
    notes.push(
      "Exercises that mainly load the areas you flagged were left out. If something feels painful, stop — and consider checking with a physiotherapist or doctor.",
    );
  if (opts.level === "beginner") notes.push("Choose a weight or variation that leaves 2–3 reps 'in the tank'. Form first.");

  const focusName = { full: "Full-body", upper: "Upper-body", lower: "Lower-body", core: "Core", cardio: "Cardio", mobility: "Mobility" }[opts.focus];
  return {
    name: `${focusName} ${opts.location === "home" ? "home" : "gym"} workout · ${opts.minutes} min`,
    items,
    estMinutes: Math.round(items.reduce((s, i) => s + itemSeconds(i), 0) / 60),
    notes,
  };
}

/**
 * Find substitutes for an exercise using the alternatives graph, filtered by what the user can do.
 * Breadth-first so the closest alternatives come first.
 */
export function substitutes(target: GenExercise & { alternatives: string[] }, all: (GenExercise & { alternatives: string[] })[], opts: Parameters<typeof canDo>[1], max = 5) {
  const bySlug = new Map(all.map((e) => [e.slug, e]));
  const seen = new Set([target.slug]);
  const queue = [...target.alternatives];
  const out: GenExercise[] = [];
  while (queue.length && out.length < max) {
    const slug = queue.shift()!;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const ex = bySlug.get(slug);
    if (!ex) continue;
    if (canDo(ex, opts)) out.push(ex);
    queue.push(...ex.alternatives);
  }
  // Fallback: same primary muscle, doable.
  if (out.length < max) {
    for (const ex of all) {
      if (out.length >= max) break;
      if (!seen.has(ex.slug) && ex.category === target.category && ex.muscleGroups[0] === target.muscleGroups[0] && canDo(ex, opts)) {
        out.push(ex);
        seen.add(ex.slug);
      }
    }
  }
  return out;
}

/** Epley estimated one-rep max — an ESTIMATE, labelled as such in the UI. */
export const estimate1RM = (weightKg: number, reps: number) => (reps <= 1 ? weightKg : Math.round(weightKg * (1 + reps / 30) * 10) / 10);
