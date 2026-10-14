"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { localToday } from "@/lib/dates";
import type { ExerciseListItem, SessionListItem } from "@/lib/client-types";
import { ExercisePicker } from "@/components/exercise-picker";
import { postOrQueue } from "@/components/offline";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingCards, PageHeader, SectionTitle, Sheet, useFeedback } from "@/components/ui";

type Trained = { exerciseId: string; name: string; sets: number };
type QuickSet = { key: string; exerciseId: string; name: string; reps: string; weightKg: string };

function QuickLog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState("Workout");
  const [date, setDate] = useState(localToday());
  const [duration, setDuration] = useState("45");
  const [sets, setSets] = useState<QuickSet[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await postOrQueue(
        "/api/workouts/sessions/quick",
        { name, date, durationMin: Number(duration), sets: sets.map((s) => ({ exerciseId: s.exerciseId, reps: s.reps ? Number(s.reps) : null, weightKg: s.weightKg ? Number(s.weightKg) : null })) },
        `Workout: ${name}`,
      );
      toast({ tone: r.queued ? "info" : "success", text: r.queued ? "Saved offline — it will sync when you're back online." : "Workout logged" });
      setSets([]);
      onSaved();
      onClose();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Log a workout" wide footer={<Button onClick={save} loading={busy} disabled={!sets.length}>Save workout</Button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Name" htmlFor="ql-n">
            <Input id="ql-n" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Date" htmlFor="ql-d">
            <Input id="ql-d" type="date" max={localToday()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Minutes" htmlFor="ql-m">
            <Input id="ql-m" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
        </div>
        <ul className="space-y-2">
          {sets.map((s, i) => (
            <li key={s.key} className="grid grid-cols-[1fr_5rem_5rem_2.25rem] items-end gap-2">
              <p className="truncate pb-3 text-sm">
                {i + 1}. {s.name}
              </p>
              <Input aria-label="Weight kg" placeholder="kg" inputMode="decimal" value={s.weightKg} onChange={(e) => setSets((xs) => xs.map((x) => (x.key === s.key ? { ...x, weightKg: e.target.value } : x)))} />
              <Input aria-label="Reps" placeholder="reps" inputMode="numeric" value={s.reps} onChange={(e) => setSets((xs) => xs.map((x) => (x.key === s.key ? { ...x, reps: e.target.value } : x)))} />
              <button aria-label="Remove set" onClick={() => setSets((xs) => xs.filter((x) => x.key !== s.key))} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setPicking(true)} icon={<Plus className="size-4" />}>
            Add exercise set
          </Button>
          {sets.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSets((xs) => [...xs, { ...xs[xs.length - 1], key: `k${Date.now()}` }])}>
              Repeat last set
            </Button>
          )}
        </div>
      </div>
      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={(e: ExerciseListItem) => setSets((xs) => [...xs, { key: `k${Date.now()}`, exerciseId: e.id, name: e.name, reps: "10", weightKg: "" }])} />
    </Sheet>
  );
}

export default function WorkoutHistory() {
  const { toast, confirm } = useFeedback();
  const { data, error, isLoading, mutate } = useSWR<SessionListItem[]>("/api/workouts/sessions?limit=100");
  const { data: trained } = useSWR<Trained[]>("/api/workouts/progress");
  const [logging, setLogging] = useState(false);

  async function remove(s: SessionListItem) {
    if (!(await confirm({ title: `Delete “${s.name}”?`, body: "This removes the workout and its sets from your history and charts.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await api.del(`/api/workouts/sessions/${s.id}`);
      mutate();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Workout history" back="/workout" actions={<Button size="sm" onClick={() => setLogging(true)} icon={<Plus className="size-4" />}>Log past workout</Button>} />
      {trained && trained.length > 0 && (
        <Card>
          <SectionTitle>Exercise progression</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {trained.slice(0, 12).map((t) => (
              <li key={t.exerciseId}>
                <Link href={`/progress/strength?exercise=${t.exerciseId}`} className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm hover:bg-surface-2">
                  {t.name} <span className="ml-1 text-xs text-muted">({t.sets} sets)</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {isLoading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data?.length ? (
        <EmptyState title="No workouts yet" action={<Button onClick={() => setLogging(true)}>Log a workout</Button>}>
          Completed workouts show up here with sets, volume and records.
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {data.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Link href={`/workout/session/${s.id}`} className="min-w-0 flex-1 hover:underline">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted">
                    {new Date(`${s.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · {s.completedSets} sets · {s.exerciseCount} exercises
                    {s.durationMin ? ` · ${s.durationMin} min` : ""}
                    {s.volumeKg ? ` · ${s.volumeKg.toLocaleString()} kg volume` : ""}
                  </p>
                </Link>
                {s.status === "in_progress" && <Badge tone="warning">In progress</Badge>}
                <button onClick={() => remove(s)} aria-label={`Delete ${s.name}`} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <QuickLog open={logging} onClose={() => setLogging(false)} onSaved={() => mutate()} />
    </div>
  );
}
