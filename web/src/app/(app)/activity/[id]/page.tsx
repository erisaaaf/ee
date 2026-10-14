"use client";

import useSWR from "swr";
import { use } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { SPORTS, sportLabel } from "@/lib/sports";
import { formatDistance, formatDuration, formatPace, formatSpeed } from "@/lib/units";
import { useMe } from "@/components/me";
import { RouteSketch } from "@/components/route-sketch";
import { Badge, Button, Card, ErrorState, LoadingCards, PageHeader, Stat, useFeedback } from "@/components/ui";

type Act = { id: string; type: string; customName: string | null; date: string; durationMin: number; distanceM: number | null; elevationM: number | null; avgHr: number | null; calories: number | null; steps: number | null; intensity: string | null; notes: string | null; source: string; route: [number, number, number, number | null][] | null };

export default function ActivityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { units } = useMe();
  const { toast, confirm } = useFeedback();
  const { data: a, error, isLoading, mutate } = useSWR<Act>(`/api/activities/${id}`);
  if (isLoading) return <LoadingCards />;
  if (error || !a) return <ErrorState error={error} onRetry={() => mutate()} />;
  const m = SPORTS[a.type]?.metrics ?? [];
  return (
    <div className="space-y-4">
      <PageHeader title={`${SPORTS[a.type]?.emoji ?? ""} ${sportLabel(a.type, a.customName)}`} subtitle={new Date(`${a.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} back="/activity" />
      <Badge tone={a.source === "manual" ? "neutral" : "info"}>{a.source === "gps" ? "Recorded with GPS" : a.source === "import" ? "Imported from file" : "Entered manually"}</Badge>
      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Duration" value={formatDuration(a.durationMin)} />
        {a.distanceM != null && <Stat label="Distance" value={formatDistance(a.distanceM, units)} />}
        {a.distanceM != null && m.includes("pace") && <Stat label="Avg pace" value={formatPace(a.distanceM, a.durationMin, units)} />}
        {a.distanceM != null && m.includes("speed") && <Stat label="Avg speed" value={formatSpeed(a.distanceM, a.durationMin, units)} />}
        {a.elevationM != null && <Stat label="Elevation gain" value={`${Math.round(a.elevationM)} m`} />}
        {a.avgHr != null && <Stat label="Avg heart rate" value={`${a.avgHr} bpm`} sub="from your device" />}
        {a.calories != null && <Stat label="Calories" value={`${Math.round(a.calories)} kcal`} sub="device / your entry" />}
        {a.steps != null && <Stat label="Steps" value={a.steps.toLocaleString()} />}
        {a.intensity && <Stat label="Intensity" value={a.intensity} />}
      </Card>
      {a.route && a.route.length > 1 && (
        <Card>
          <RouteSketch points={a.route} />
          <p className="mt-2 text-center text-xs text-muted">Green = start, red = finish. Shape only; no map service is contacted.</p>
        </Card>
      )}
      {a.notes && <p className="text-sm text-muted">{a.notes}</p>}
      <Button
        variant="ghost"
        className="text-danger"
        onClick={async () => {
          if (!(await confirm({ title: "Delete this activity?", confirmLabel: "Delete", danger: true }))) return;
          try {
            await api.del(`/api/activities/${id}`);
            router.push("/activity");
          } catch (e) {
            toast({ tone: "error", text: errorMessage(e) });
          }
        }}
      >
        Delete activity
      </Button>
    </div>
  );
}
