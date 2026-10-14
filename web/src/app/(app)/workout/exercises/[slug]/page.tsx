"use client";

import Link from "next/link";
import useSWR from "swr";
import { use } from "react";
import { Heart } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { ExerciseDetail } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { TrendLine } from "@/components/charts";
import { Alert, Badge, Button, Card, ErrorState, InfoTip, LoadingCards, PageHeader, SectionTitle, useFeedback } from "@/components/ui";
import { formatWeight } from "@/lib/units";

export default function ExercisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { units } = useMe();
  const { toast } = useFeedback();
  const { data: e, error, isLoading, mutate } = useSWR<ExerciseDetail>(`/api/exercises/${slug}`);
  if (isLoading) return <LoadingCards />;
  if (error || !e) return <ErrorState error={error} onRetry={() => mutate()} />;
  const weighted = e.history.points.some((p) => p.topWeightKg);

  return (
    <div className="space-y-4">
      <PageHeader
        title={e.name}
        subtitle={e.muscleGroups.join(" · ")}
        back="/workout/exercises"
        actions={
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={e.isFavorite}
            onClick={async () => {
              try {
                await api.post("/api/favorites", { kind: "exercise", refId: e.id });
                mutate();
              } catch (err) {
                toast({ tone: "error", text: errorMessage(err) });
              }
            }}
            icon={<Heart className={e.isFavorite ? "size-4 fill-fat text-fat" : "size-4"} />}
          >
            {e.isFavorite ? "Favourite" : "Save"}
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Badge>{e.category}</Badge>
        <Badge>{e.difficulty}</Badge>
        <Badge tone={e.equipment.length ? "neutral" : "success"}>{e.equipment.length ? e.equipment.join(", ").replace(/_/g, " ") : "No equipment"}</Badge>
      </div>
      {!e.doableWithMyEquipment && (
        <Alert tone="info" title="Needs equipment you haven't listed">
          {e.substitutesForMyEquipment.length ? "Try one of the substitutes below that fit your equipment." : "Update your equipment in Settings to see substitutes."}
        </Alert>
      )}
      <Card>
        <SectionTitle>How to do it</SectionTitle>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          {e.instructions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {e.commonMistakes.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Common mistakes</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
              {e.commonMistakes.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-4 text-xs text-muted">Move within a comfortable range. Stop if you feel sharp pain, and consider professional guidance for injuries.</p>
      </Card>
      {(e.homeVersion || e.gymVersion) && (
        <Card className="grid gap-3 text-sm sm:grid-cols-2">
          {e.homeVersion && (
            <div>
              <p className="font-semibold">At home</p>
              <p className="text-muted">{e.homeVersion}</p>
            </div>
          )}
          {e.gymVersion && (
            <div>
              <p className="font-semibold">At the gym</p>
              <p className="text-muted">{e.gymVersion}</p>
            </div>
          )}
        </Card>
      )}
      <Card>
        <SectionTitle>Alternatives</SectionTitle>
        {e.substitutesForMyEquipment.length > 0 && (
          <>
            <p className="mb-2 text-xs text-muted">Fit your equipment:</p>
            <ul className="mb-3 flex flex-wrap gap-2">
              {e.substitutesForMyEquipment.map((a) => (
                <li key={a.slug}>
                  <Link href={`/workout/exercises/${a.slug}`} className="inline-flex min-h-9 items-center rounded-full border border-primary bg-primary-soft px-3 text-sm text-primary">
                    {a.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <ul className="flex flex-wrap gap-2">
          {e.alternativesResolved.map((a) => (
            <li key={a.slug}>
              <Link href={`/workout/exercises/${a.slug}`} className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm hover:bg-surface-2">
                {a.name}
              </Link>
            </li>
          ))}
          {!e.alternativesResolved.length && <li className="text-sm text-muted">No listed alternatives.</li>}
        </ul>
      </Card>
      <Card>
        <SectionTitle action={<InfoTip term="progressiveOverload" />}>Your progress</SectionTitle>
        {e.history.sessions === 0 ? (
          <p className="text-sm text-muted">You haven&apos;t logged this exercise yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-surface-2 p-2">
                <p className="text-xs text-muted">Sessions</p>
                <p className="font-semibold">{e.history.sessions}</p>
              </div>
              <div className="rounded-xl bg-surface-2 p-2">
                <p className="text-xs text-muted">Heaviest</p>
                <p className="font-semibold">{e.history.best.weightKg ? formatWeight(e.history.best.weightKg, units) : "—"}</p>
              </div>
              <div className="rounded-xl bg-surface-2 p-2">
                <p className="flex items-center justify-center text-xs text-muted">
                  Est. 1RM <InfoTip term="oneRepMax" />
                </p>
                <p className="font-semibold">{e.history.best.est1RM ? `≈ ${formatWeight(e.history.best.est1RM, units)}` : "—"}</p>
              </div>
            </div>
            {weighted ? (
              <TrendLine title="Top set weight" data={e.history.points.map((p) => ({ date: p.date, value: p.topWeightKg == null ? null : units === "imperial" ? p.topWeightKg / 0.45359237 : p.topWeightKg }))} unit={units === "imperial" ? "lb" : "kg"} />
            ) : (
              <TrendLine title="Total reps per session" data={e.history.points.map((p) => ({ date: p.date, value: p.totalReps }))} unit="reps" />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
