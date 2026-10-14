"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Template } from "@/lib/client-types";
import { ExercisePicker } from "./exercise-picker";
import { Alert, Button, Card, Chips, Field, Input, Select, Textarea, useFeedback } from "./ui";

export type PlanItem = { key: string; exerciseId: string; name: string; trackingType: string; sets: string; reps: string; durationSec: string; restSec: string; weightKg: string };

export function itemsFromTemplate(t: Template): PlanItem[] {
  return t.items.map((i) => ({
    key: i.id,
    exerciseId: i.exerciseId,
    name: i.exercise?.name ?? "Exercise",
    trackingType: i.exercise?.trackingType ?? "reps",
    sets: String(i.sets),
    reps: i.reps?.toString() ?? "",
    durationSec: i.durationSec?.toString() ?? "",
    restSec: String(i.restSec),
    weightKg: i.weightKg?.toString() ?? "",
  }));
}

export function PlanEditor({ initial, initialItems, defaults }: { initial?: Template; initialItems?: PlanItem[]; defaults?: { name?: string; location?: string; source?: string; estDurationMin?: number } }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [name, setName] = useState(initial?.name ?? defaults?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [location, setLocation] = useState(initial?.location ?? defaults?.location ?? "any");
  const [days, setDays] = useState<string[]>(initial?.scheduledDays.map(String) ?? []);
  const [items, setItems] = useState<PlanItem[]>(initialItems ?? (initial ? itemsFromTemplate(initial) : []));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (key: string, p: Partial<PlanItem>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const move = (i: number, d: number) =>
    setItems((xs) => {
      const c = [...xs];
      const [x] = c.splice(i, 1);
      c.splice(i + d, 0, x);
      return c;
    });
  const n = (v: string) => (v.trim() === "" ? null : Number(v));

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      name,
      description: description || null,
      location,
      source: initial?.source ?? defaults?.source ?? "user",
      estDurationMin: initial?.estDurationMin ?? defaults?.estDurationMin ?? null,
      scheduledDays: days.map(Number),
      items: items.map((i) => ({ exerciseId: i.exerciseId, sets: Number(i.sets) || 1, reps: n(i.reps), durationSec: n(i.durationSec), restSec: Number(i.restSec) || 0, weightKg: n(i.weightKg) })),
    };
    try {
      const t = initial ? await api.put<Template>(`/api/workouts/templates/${initial.id}`, body) : await api.post<Template>("/api/workouts/templates", body);
      toast({ tone: "success", text: "Workout plan saved" });
      router.push(`/workout/plans/${t.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <Field label="Plan name" htmlFor="pn">
          <Input id="pn" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Upper body A" maxLength={100} />
        </Field>
        <Field label="Notes" htmlFor="pdsc" optional>
          <Textarea id="pdsc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </Field>
        <Field label="Where" htmlFor="ploc">
          <Select id="ploc" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="any">Anywhere</option>
            <option value="home">Home</option>
            <option value="gym">Gym</option>
          </Select>
        </Field>
        <Field label="Scheduled days" optional hint="Shows up as today's workout on these days.">
          <Chips label="Days" options={["1", "2", "3", "4", "5", "6", "0"].map((d) => ({ value: d, label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][Number(d)] }))} value={days} onChange={setDays} />
        </Field>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Exercises</h2>
        {items.length === 0 && <p className="text-sm text-muted">No exercises yet.</p>}
        {items.map((it, idx) => {
          const timed = it.trackingType === "time" || it.trackingType === "distance";
          return (
            <div key={it.key} className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-medium">
                  {idx + 1}. {it.name}
                </p>
                <button aria-label="Move up" disabled={idx === 0} onClick={() => move(idx, -1)} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-2 disabled:opacity-30">
                  <ArrowUp className="size-4" />
                </button>
                <button aria-label="Move down" disabled={idx === items.length - 1} onClick={() => move(idx, 1)} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-2 disabled:opacity-30">
                  <ArrowDown className="size-4" />
                </button>
                <button aria-label={`Remove ${it.name}`} onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <Field label="Sets" htmlFor={`s-${it.key}`}>
                  <Input id={`s-${it.key}`} inputMode="numeric" value={it.sets} onChange={(e) => update(it.key, { sets: e.target.value })} />
                </Field>
                {timed ? (
                  <Field label="Seconds" htmlFor={`d-${it.key}`}>
                    <Input id={`d-${it.key}`} inputMode="numeric" value={it.durationSec} onChange={(e) => update(it.key, { durationSec: e.target.value })} />
                  </Field>
                ) : (
                  <Field label="Reps" htmlFor={`r-${it.key}`}>
                    <Input id={`r-${it.key}`} inputMode="numeric" value={it.reps} onChange={(e) => update(it.key, { reps: e.target.value })} />
                  </Field>
                )}
                <Field label="Rest (s)" htmlFor={`rs-${it.key}`}>
                  <Input id={`rs-${it.key}`} inputMode="numeric" value={it.restSec} onChange={(e) => update(it.key, { restSec: e.target.value })} />
                </Field>
                <Field label="Kg" htmlFor={`w-${it.key}`} optional>
                  <Input id={`w-${it.key}`} inputMode="decimal" value={it.weightKg} onChange={(e) => update(it.key, { weightKg: e.target.value })} />
                </Field>
              </div>
            </div>
          );
        })}
        <Button variant="secondary" size="sm" onClick={() => setPicking(true)} icon={<Plus className="size-4" />}>
          Add exercise
        </Button>
      </Card>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex justify-between gap-2">
        {initial ? (
          <Button
            variant="ghost"
            className="text-danger"
            onClick={async () => {
              if (await confirm({ title: "Delete this plan?", body: "Workouts you've already logged stay in your history.", confirmLabel: "Delete", danger: true })) {
                try {
                  await api.del(`/api/workouts/templates/${initial.id}`);
                  router.push("/workout");
                } catch (e) {
                  toast({ tone: "error", text: errorMessage(e) });
                }
              }
            }}
          >
            Delete plan
          </Button>
        ) : (
          <span />
        )}
        <Button size="lg" onClick={save} loading={busy} disabled={!items.length || !name.trim()}>
          Save plan
        </Button>
      </div>
      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(e) => setItems((xs) => [...xs, { key: `n${Date.now()}`, exerciseId: e.id, name: e.name, trackingType: e.trackingType, sets: "3", reps: e.trackingType === "time" ? "" : "10", durationSec: e.trackingType === "time" ? "30" : "", restSec: "60", weightKg: "" }])}
      />
    </div>
  );
}
