"use client";

import useSWR from "swr";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Timer, Trash2, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Session } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { ExercisePicker } from "@/components/exercise-picker";
import { Alert, Button, Card, cx, ErrorState, Field, Input, LoadingCards, PageHeader, Select, Sheet, Textarea, useFeedback } from "@/components/ui";
import { kgToLb, lbToKg } from "@/lib/units";

type SetRow = Session["sets"][number];

function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) {
      navigator.vibrate?.([150, 80, 150]);
      onDone();
    }
  }, [left, onDone]);
  return (
    <div role="timer" aria-live="polite" className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-text px-4 py-3 text-bg shadow-lg lg:bottom-6">
      <Timer className="size-5" aria-hidden />
      <span className="flex-1 text-sm">Rest</span>
      <span className="tabular text-xl font-semibold">
        {Math.floor(Math.max(0, left) / 60)}:{String(Math.max(0, left) % 60).padStart(2, "0")}
      </span>
      <button onClick={() => setLeft((l) => l + 15)} className="rounded-lg px-2 py-1 text-sm underline">
        +15s
      </button>
      <button onClick={onDone} aria-label="Skip rest" className="inline-flex size-9 items-center justify-center rounded-lg">
        <X className="size-4" />
      </button>
    </div>
  );
}

function SetLine({ s, idx, sessionId, imperial, onChange, onRest }: { s: SetRow; idx: number; sessionId: string; imperial: boolean; onChange: (sess: Session) => void; onRest: (sec: number) => void }) {
  const { toast } = useFeedback();
  const [reps, setReps] = useState(s.reps?.toString() ?? "");
  const [weight, setWeight] = useState(s.weightKg != null ? String(Math.round((imperial ? kgToLb(s.weightKg) : s.weightKg) * 10) / 10) : "");
  const [dur, setDur] = useState(s.durationSec?.toString() ?? "");
  const timed = s.durationSec != null && s.reps == null;
  async function patch(body: Record<string, unknown>) {
    try {
      onChange(await api.patch<Session>(`/api/workouts/sessions/${sessionId}/sets/${s.id}`, body));
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }
  const values = () => ({
    reps: reps === "" ? null : Number(reps),
    weightKg: weight === "" ? null : Math.round((imperial ? lbToKg(Number(weight)) : Number(weight)) * 100) / 100,
    durationSec: dur === "" ? null : Number(dur),
  });
  return (
    <li className={cx("grid grid-cols-[2rem_1fr_1fr_2.75rem_2.25rem] items-center gap-2 rounded-xl px-1 py-1", s.completed && "bg-success-soft/60")}>
      <span className="text-center text-sm text-muted">{idx + 1}</span>
      {timed ? (
        <Input aria-label={`Set ${idx + 1} seconds`} inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} onBlur={() => patch(values())} placeholder="sec" className="col-span-2 min-h-10" />
      ) : (
        <>
          <Input aria-label={`Set ${idx + 1} weight`} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} onBlur={() => patch(values())} placeholder={imperial ? "lb" : "kg"} className="min-h-10" />
          <Input aria-label={`Set ${idx + 1} reps`} inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} onBlur={() => patch(values())} placeholder="reps" className="min-h-10" />
        </>
      )}
      <button
        aria-label={s.completed ? `Mark set ${idx + 1} not done` : `Mark set ${idx + 1} done`}
        aria-pressed={s.completed}
        onClick={async () => {
          await patch({ ...values(), completed: !s.completed });
          if (!s.completed && s.restSec) onRest(s.restSec);
        }}
        className={cx("inline-flex size-11 items-center justify-center rounded-xl border", s.completed ? "border-success bg-success text-white" : "border-border hover:bg-surface-2")}
      >
        <Check className="size-5" />
      </button>
      <button
        aria-label={`Delete set ${idx + 1}`}
        onClick={async () => {
          try {
            onChange(await api.del<Session>(`/api/workouts/sessions/${sessionId}/sets/${s.id}`));
          } catch (e) {
            toast({ tone: "error", text: errorMessage(e) });
          }
        }}
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { units } = useMe();
  const { toast, confirm } = useFeedback();
  const { data: s, error, isLoading, mutate } = useSWR<Session>(`/api/workouts/sessions/${id}`, { revalidateOnFocus: false });
  const [rest, setRest] = useState<{ sec: number; key: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [effort, setEffort] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [records, setRecords] = useState<{ exerciseName: string; kind: string; value: number }[] | null>(null);
  const [finishMinutes, setFinishMinutes] = useState(1);

  if (isLoading) return <LoadingCards />;
  if (error || !s) return <ErrorState error={error} onRetry={() => mutate()} />;
  const imperial = units === "imperial";
  const done = s.sets.filter((x) => x.completed).length;
  const set = (sess: Session) => mutate(sess, false);

  async function addSet(exerciseId: string) {
    const last = s!.exercises.find((e) => e.exerciseId === exerciseId)?.sets.at(-1);
    try {
      set(await api.post<Session>(`/api/workouts/sessions/${id}/sets`, { exerciseId, reps: last?.reps ?? 10, weightKg: last?.weightKg ?? null, durationSec: last?.durationSec ?? null, restSec: last?.restSec ?? 60 }));
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }
  async function finish() {
    setBusy(true);
    try {
      const r = await api.post<{ session: Session; newRecords: { exerciseName: string; kind: string; value: number }[] }>(`/api/workouts/sessions/${id}/finish`, { effort: effort ? Number(effort) : null, notes: notes || null });
      setFinishing(false);
      if (r.newRecords.length) setRecords(r.newRecords);
      else {
        toast({ tone: "success", text: "Workout saved. Well done!" });
        router.push("/workout");
      }
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (s.status === "completed" && !records) {
    return (
      <div className="space-y-4">
        <PageHeader title={s.name} subtitle={`${s.date} · ${s.durationMin ?? "?"} min · completed`} back="/workout/history" />
        {s.exercises.map((e) => (
          <Card key={e.exerciseId}>
            <h2 className="font-semibold">{e.exercise?.name ?? e.sets[0]?.exerciseName}</h2>
            <ul className="mt-1 text-sm text-muted">
              {e.sets
                .filter((x) => x.completed)
                .map((x, i) => (
                  <li key={x.id}>
                    Set {i + 1}: {x.durationSec && !x.reps ? `${x.durationSec}s` : `${x.reps ?? "—"} reps`}
                    {x.weightKg ? ` @ ${imperial ? Math.round(kgToLb(x.weightKg)) + " lb" : x.weightKg + " kg"}` : ""}
                  </li>
                ))}
            </ul>
          </Card>
        ))}
        {s.notes && <p className="text-sm text-muted">Notes: {s.notes}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={s.name}
        subtitle={`${done} set${done === 1 ? "" : "s"} done`}
        back="/workout"
        actions={
          <Button
            onClick={() => {
              setFinishMinutes(Math.max(1, Math.round((Date.now() - new Date(s.startedAt).getTime()) / 60000)));
              setFinishing(true);
            }}
            disabled={!done}
          >
            Finish
          </Button>
        }
      />
      {s.exercises.length === 0 && <Alert tone="info">Add your first exercise to get started.</Alert>}
      {s.exercises.map((e) => (
        <Card key={e.exerciseId} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{e.exercise?.name ?? "Exercise"}</h2>
            {e.exercise && (
              <a href={`/workout/exercises/${e.exercise.slug}`} className="text-xs text-primary hover:underline" target="_blank" rel="noreferrer">
                How-to & alternatives
              </a>
            )}
          </div>
          <div className="grid grid-cols-[2rem_1fr_1fr_2.75rem_2.25rem] gap-2 px-1 text-xs text-muted" aria-hidden>
            <span className="text-center">Set</span>
            {e.sets[0] && e.sets[0].durationSec != null && e.sets[0].reps == null ? (
              <span className="col-span-2">Seconds</span>
            ) : (
              <>
                <span>{imperial ? "lb" : "kg"} (optional)</span>
                <span>Reps</span>
              </>
            )}
            <span>Done</span>
          </div>
          <ul className="space-y-1">
            {e.sets.map((x, i) => (
              <SetLine key={x.id} s={x} idx={i} sessionId={id} imperial={imperial} onChange={set} onRest={(sec) => setRest({ sec, key: Date.now() })} />
            ))}
          </ul>
          <Button size="sm" variant="ghost" onClick={() => addSet(e.exerciseId)} icon={<Plus className="size-4" />}>
            Add set
          </Button>
        </Card>
      ))}
      <Button variant="secondary" className="w-full" onClick={() => setPicking(true)} icon={<Plus className="size-4" />}>
        Add exercise
      </Button>
      <Button
        variant="ghost"
        className="w-full text-danger"
        onClick={async () => {
          if (await confirm({ title: "Discard this workout?", body: "Nothing from this session will be saved.", confirmLabel: "Discard", danger: true })) {
            try {
              await api.del(`/api/workouts/sessions/${id}`);
              router.push("/workout");
            } catch (e) {
              toast({ tone: "error", text: errorMessage(e) });
            }
          }
        }}
      >
        Discard workout
      </Button>

      {rest && <RestTimer key={rest.key} seconds={rest.sec} onDone={() => setRest(null)} />}
      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={async (ex) => {
          try {
            set(await api.post<Session>(`/api/workouts/sessions/${id}/sets`, { exerciseId: ex.id, reps: ex.trackingType === "time" ? null : 10, durationSec: ex.trackingType === "time" ? 30 : null, restSec: 60 }));
          } catch (e) {
            toast({ tone: "error", text: errorMessage(e) });
          }
        }}
      />
      <Sheet
        open={finishing}
        onClose={() => setFinishing(false)}
        title="Finish workout"
        footer={
          <Button onClick={finish} loading={busy}>
            Save workout
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {done} sets completed · about {finishMinutes} min
          </p>
          <Field label="How hard did it feel?" htmlFor="eff" optional hint="1 = very easy, 10 = maximal effort">
            <Select id="eff" value={effort} onChange={(e) => setEffort(e.target.value)}>
              <option value="">—</option>
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="fn" optional>
            <Textarea id="fn" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </Field>
        </div>
      </Sheet>
      <Sheet
        open={!!records}
        onClose={() => router.push("/workout")}
        title="New personal records 🎉"
        footer={<Button onClick={() => router.push("/workout")}>Done</Button>}
      >
        <ul className="space-y-2 text-sm">
          {records?.map((r) => (
            <li key={r.exerciseName + r.kind} className="rounded-xl bg-success-soft p-3">
              <span className="font-medium">{r.exerciseName}</span>: {r.kind} {r.value}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Compared with your earlier logged sessions. Estimated 1-rep max values are calculations, not tested lifts.</p>
      </Sheet>
    </div>
  );
}
