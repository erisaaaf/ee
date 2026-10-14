"use client";

import useSWR from "swr";
import { useState } from "react";
import { Pause, Play, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { localToday } from "@/lib/dates";
import type { ExerciseListItem, Goal } from "@/lib/client-types";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingCards, PageHeader, ProgressBar, Select, Sheet, useFeedback } from "@/components/ui";

const TYPES = [
  { key: "workouts_per_week", label: "Complete workouts each week", unit: "workouts", def: 3 },
  { key: "water_daily", label: "Drink water each day", unit: "ml", def: 2000 },
  { key: "steps_daily", label: "Walk a number of steps each day", unit: "steps", def: 7000 },
  { key: "distance_weekly", label: "Walk / run / cycle a distance each week", unit: "km", def: 15 },
  { key: "sleep_daily", label: "Sleep a number of hours", unit: "hours", def: 8 },
  { key: "workouts_total", label: "Complete a number of workouts", unit: "workouts", def: 10 },
  { key: "exercise_weight", label: "Improve a specific exercise", unit: "kg", def: 40 },
  { key: "custom", label: "Custom habit (check off yourself)", unit: "", def: 1 },
] as const;

export default function GoalsPage() {
  const { toast, confirm } = useFeedback();
  const { data, error, isLoading, mutate } = useSWR<Goal[]>("/api/goals");
  const { data: exercises } = useSWR<ExerciseListItem[]>("/api/exercises?category=strength");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number]["key"]>("workouts_per_week");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("3");
  const [exerciseId, setExerciseId] = useState("");
  const [busy, setBusy] = useState(false);
  const def = TYPES.find((t) => t.key === type)!;

  async function create() {
    setBusy(true);
    try {
      await api.post("/api/goals", { type, title: title || def.label, target: Number(target), exerciseId: type === "exercise_weight" ? exerciseId || null : null, startDate: localToday() });
      setOpen(false);
      setTitle("");
      mutate();
      toast({ tone: "success", text: "Goal added" });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api.patch(`/api/goals/${id}`, body);
      mutate();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Goals" subtitle="Flexible, editable, and pausable" back="/progress" actions={<Button size="sm" onClick={() => setOpen(true)} icon={<Plus className="size-4" />}>New goal</Button>} />
      {isLoading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data?.length ? (
        <EmptyState title="No goals yet" action={<Button onClick={() => setOpen(true)}>Set your first goal</Button>}>
          Pick something small and specific — like 3 workouts a week. You can change or pause it any time.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.map((g) => (
            <Card as="li" key={g.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{g.title}</p>
                  <p className="text-xs text-muted">{g.exerciseName ? `${g.exerciseName} · ` : ""}{g.label}</p>
                </div>
                <div className="flex items-center gap-1">
                  {g.status === "paused" && <Badge>Paused</Badge>}
                  {g.met && g.status === "active" && <Badge tone="success">✓ Met</Badge>}
                  <button onClick={() => patch(g.id, { status: g.status === "paused" ? "active" : "paused" })} aria-label={g.status === "paused" ? `Resume ${g.title}` : `Pause ${g.title}`} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
                    {g.status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirm({ title: "Delete this goal?", confirmLabel: "Delete", danger: true })) {
                        await api.del(`/api/goals/${g.id}`).catch((e) => toast({ tone: "error", text: errorMessage(e) }));
                        mutate();
                      }
                    }}
                    aria-label={`Delete ${g.title}`}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <ProgressBar value={g.current} max={g.target} label={g.title} className="mt-2" color={g.met ? "var(--success)" : "var(--primary)"} />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted">{g.percent}%{g.period === "week" ? " this week" : g.period === "day" ? " today" : ""}</p>
                <div className="flex items-center gap-2">
                  {g.type === "custom" && g.status !== "completed" && (
                    <Button size="sm" variant="soft" onClick={() => patch(g.id, { status: "completed" })}>
                      Mark done
                    </Button>
                  )}
                  <label className="flex items-center gap-1 text-xs text-muted">
                    Target
                    <input
                      aria-label={`Target for ${g.title}`}
                      defaultValue={g.target}
                      inputMode="decimal"
                      onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== g.target && patch(g.id, { target: Number(e.target.value) })}
                      className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-right text-sm"
                    />
                    {g.unit}
                  </label>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="New goal" footer={<Button onClick={create} loading={busy} disabled={!(Number(target) > 0) || (type === "exercise_weight" && !exerciseId)}>Add goal</Button>}>
        <div className="space-y-4">
          <Field label="Type" htmlFor="gt">
            <Select
              id="gt"
              value={type}
              onChange={(e) => {
                const k = e.target.value as typeof type;
                setType(k);
                setTarget(String(TYPES.find((t) => t.key === k)!.def));
              }}
            >
              {TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          {type === "exercise_weight" && (
            <Field label="Exercise" htmlFor="gx">
              <Select id="gx" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
                <option value="">Choose…</option>
                {exercises?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Name" htmlFor="gtt" optional>
            <Input id="gtt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={def.label} maxLength={100} />
          </Field>
          {type !== "custom" && (
            <Field label={`Target (${def.unit})`} htmlFor="gtg">
              <Input id="gtg" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
          )}
          <p className="text-xs text-muted">Progress is calculated from what you log. Choose something realistic — consistency beats intensity.</p>
        </div>
      </Sheet>
    </div>
  );
}
