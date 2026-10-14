"use client";

import useSWR from "swr";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ExerciseHistory } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { TrendLine } from "@/components/charts";
import { kgToLb } from "@/lib/units";
import { Card, EmptyState, Field, InfoTip, LinkButton, LoadingCards, PageHeader, Select } from "@/components/ui";

type Trained = { exerciseId: string; name: string; sets: number };

function Strength() {
  const { units } = useMe();
  const p = useSearchParams();
  const { data: trained } = useSWR<Trained[]>("/api/workouts/progress");
  const [sel, setSel] = useState<string | null>(p.get("exercise"));
  const exerciseId = sel ?? trained?.[0]?.exerciseId ?? null;
  const { data: hist, isLoading } = useSWR<ExerciseHistory>(exerciseId ? `/api/workouts/progress/${exerciseId}` : null);
  const conv = (v: number | null) => (v == null ? null : units === "imperial" ? Math.round(kgToLb(v) * 10) / 10 : v);
  const u = units === "imperial" ? "lb" : "kg";

  if (!trained) return <LoadingCards />;
  if (!trained.length)
    return (
      <>
        <PageHeader title="Strength progression" back="/progress" />
        <EmptyState title="No workouts logged yet" action={<LinkButton href="/workout" variant="primary">Go to workouts</LinkButton>}>
          Once you log sets, you&apos;ll see weight, reps and volume for each exercise over time.
        </EmptyState>
      </>
    );
  return (
    <div className="space-y-4">
      <PageHeader title="Strength progression" back="/progress" />
      <Card>
        <Field label="Exercise" htmlFor="ex">
          <Select id="ex" value={exerciseId ?? ""} onChange={(e) => setSel(e.target.value)}>
            {trained.map((t) => (
              <option key={t.exerciseId} value={t.exerciseId}>
                {t.name} ({t.sets} sets)
              </option>
            ))}
          </Select>
        </Field>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted">
          Small, steady increases over weeks are what count. <InfoTip term="progressiveOverload" />
        </p>
      </Card>
      {isLoading || !hist ? (
        <LoadingCards count={2} />
      ) : (
        <>
          {hist.points.some((x) => x.topWeightKg) && <TrendLine title="Top set weight" data={hist.points.map((x) => ({ date: x.date, value: conv(x.topWeightKg) }))} unit={u} />}
          {hist.points.some((x) => x.est1RM) && <TrendLine title="Estimated 1-rep max" subtitle="Calculated with the Epley formula — an estimate, not a tested lift" data={hist.points.map((x) => ({ date: x.date, value: conv(x.est1RM) }))} unit={u} color="var(--protein)" />}
          <TrendLine title="Volume per session" subtitle="Weight × reps across completed sets" data={hist.points.map((x) => ({ date: x.date, value: conv(x.volumeKg) }))} unit={u} color="var(--carbs)" />
          <TrendLine title="Total reps per session" data={hist.points.map((x) => ({ date: x.date, value: x.totalReps }))} unit="reps" color="var(--activity)" />
        </>
      )}
    </div>
  );
}

export default function StrengthPage() {
  return (
    <Suspense>
      <Strength />
    </Suspense>
  );
}
