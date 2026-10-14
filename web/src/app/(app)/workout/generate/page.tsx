"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Play, RefreshCw, Save } from "lucide-react";
import { api, errorMessage, newClientId } from "@/lib/api";
import { localToday } from "@/lib/dates";
import { EQUIPMENT } from "@/lib/validation";
import type { GeneratedWorkout, Session, Template } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { Alert, Badge, Button, Card, Chips, Field, PageHeader, Segmented, Select, Toggle, useFeedback } from "@/components/ui";

const AREAS = ["knees", "shoulders", "lower back", "wrists", "hips"];

function Generator() {
  const { me } = useMe();
  const p = useSearchParams();
  const router = useRouter();
  const { toast } = useFeedback();
  const [location, setLocation] = useState<"home" | "gym">((p.get("location") as "home" | "gym") ?? (me.preferences.gymAccess && !me.preferences.homeWorkouts ? "gym" : "home"));
  const [minutes, setMinutes] = useState(p.get("minutes") ?? String(me.preferences.workoutDurationMin ?? 30));
  const [goal, setGoal] = useState(p.get("goal") ?? (me.preferences.goals.includes("strength") ? "strength" : me.preferences.goals.includes("endurance") ? "endurance" : "general"));
  const [focus, setFocus] = useState(p.get("focus") ?? "full");
  const [level, setLevel] = useState(me.profile.experience ?? "beginner");
  const [equipment, setEquipment] = useState<string[]>(p.get("equipment") === "none" ? [] : me.preferences.equipment);
  const [lowImpact, setLowImpact] = useState(false);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [plan, setPlan] = useState<GeneratedWorkout | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function generate() {
    setBusy("gen");
    try {
      setPlan(await api.post<GeneratedWorkout>("/api/workouts/generate", { minutes: Number(minutes), location, goal, focus, level, equipment: location === "gym" ? undefined : equipment, lowImpact, avoidAreas: avoid }));
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }
  async function save(andStart: boolean) {
    if (!plan) return;
    setBusy(andStart ? "start" : "save");
    try {
      const t = await api.post<Template>("/api/workouts/templates", {
        name: plan.name,
        location,
        source: "generator",
        estDurationMin: plan.estMinutes,
        scheduledDays: [],
        items: plan.items.map((i) => ({ exerciseId: i.exerciseId, sets: i.sets, reps: i.reps, durationSec: i.durationSec, restSec: i.restSec })),
      });
      if (andStart) {
        const s = await api.post<Session>("/api/workouts/sessions", { templateId: t.id, date: localToday(), clientId: newClientId() });
        router.push(`/workout/session/${s.id}`);
      } else {
        toast({ tone: "success", text: "Saved to your plans" });
        router.push(`/workout/plans/${t.id}`);
      }
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Workout generator" subtitle="Built from the exercise library for your time and equipment" back="/workout" />
      <Card className="space-y-4">
        <Segmented label="Location" value={location} onChange={setLocation} options={[{ value: "home", label: "Home" }, { value: "gym", label: "Gym" }]} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Time" htmlFor="gm">
            <Select id="gm" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              {[10, 15, 20, 30, 45, 60, 75, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Goal" htmlFor="gg">
            <Select id="gg" value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option value="general">General fitness</option>
              <option value="strength">Strength</option>
              <option value="endurance">Endurance</option>
              <option value="mobility">Mobility</option>
            </Select>
          </Field>
          <Field label="Focus" htmlFor="gf">
            <Select id="gf" value={focus} onChange={(e) => setFocus(e.target.value)}>
              <option value="full">Full body</option>
              <option value="upper">Upper body</option>
              <option value="lower">Lower body</option>
              <option value="core">Core</option>
              <option value="cardio">Cardio</option>
              <option value="mobility">Mobility</option>
            </Select>
          </Field>
          <Field label="Level" htmlFor="gl">
            <Select id="gl" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </Select>
          </Field>
        </div>
        {location === "home" && (
          <Field label="Equipment available" hint="None selected = bodyweight only.">
            <Chips label="Equipment" options={EQUIPMENT.filter((e) => !["cable_machine", "machines"].includes(e.key)).map((e) => ({ value: e.key, label: e.label }))} value={equipment} onChange={setEquipment} />
          </Field>
        )}
        <Toggle label="Low impact" description="No jumping — easier on joints and neighbours." checked={lowImpact} onChange={setLowImpact} />
        <Field label="Leave out exercises that load…" optional hint="We'll skip exercises that mainly work these areas. This isn't medical advice — check with a professional about injuries.">
          <Chips label="Areas to avoid" options={AREAS.map((a) => ({ value: a, label: a }))} value={avoid} onChange={setAvoid} />
        </Field>
        <Button size="lg" className="w-full" onClick={generate} loading={busy === "gen"} icon={plan ? <RefreshCw className="size-4" /> : undefined}>
          {plan ? "Generate another" : "Generate workout"}
        </Button>
      </Card>

      {plan && (
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">{plan.name}</h2>
              <p className="text-xs text-muted">About {plan.estMinutes} min (estimate)</p>
            </div>
            <Badge tone="primary">Generated</Badge>
          </div>
          {plan.notes.map((n) => (
            <Alert key={n} tone="info">
              {n}
            </Alert>
          ))}
          {(["warmup", "main", "cooldown"] as const).map((b) => {
            const items = plan.items.filter((i) => i.block === b);
            if (!items.length) return null;
            return (
              <div key={b}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{b === "warmup" ? "Warm-up" : b === "main" ? "Main" : "Cool-down"}</h3>
                <ul className="divide-y divide-border">
                  {items.map((i) => (
                    <li key={i.slug} className="flex justify-between gap-2 py-2 text-sm">
                      <a href={`/workout/exercises/${i.slug}`} className="font-medium hover:underline">
                        {i.name}
                      </a>
                      <span className="text-muted">
                        {i.sets} × {i.durationSec ? `${i.durationSec}s` : `${i.reps} reps`}
                        {i.restSec ? ` · ${i.restSec}s rest` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => save(true)} loading={busy === "start"} icon={<Play className="size-4" />}>
              Start now
            </Button>
            <Button variant="secondary" onClick={() => save(false)} loading={busy === "save"} icon={<Save className="size-4" />}>
              Save as plan
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense>
      <Generator />
    </Suspense>
  );
}
