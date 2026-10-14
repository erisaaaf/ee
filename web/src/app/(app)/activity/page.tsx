"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { MapPin, Plus, Upload } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { addDays, localToday } from "@/lib/dates";
import { SPORTS, sportLabel } from "@/lib/sports";
import { formatDistance, formatDuration } from "@/lib/units";
import { useMe } from "@/components/me";
import { DailyBarChart } from "@/components/charts";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LinkButton, LoadingCards, PageHeader, SectionTitle, useFeedback } from "@/components/ui";

type Act = { id: string; type: string; customName: string | null; date: string; durationMin: number; distanceM: number | null; source: string; intensity: string | null };

export default function ActivityPage() {
  const { units, me } = useMe();
  const { toast } = useFeedback();
  const today = localToday();
  const { data, error, isLoading, mutate } = useSWR<Act[]>("/api/activities?limit=60");
  const { data: steps, mutate: mutateSteps } = useSWR<{ date: string; steps: number | null; source: string | null }[]>(`/api/steps?start=${addDays(today, -13)}&end=${today}`);
  const [stepVal, setStepVal] = useState("");
  const [stepDate, setStepDate] = useState(today);

  async function saveSteps() {
    try {
      await api.put("/api/steps", { date: stepDate, steps: Number(stepVal) });
      setStepVal("");
      mutateSteps();
      toast({ tone: "success", text: "Steps saved" });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }
  const favSports = me.preferences.preferredSports.filter((s) => s in SPORTS);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sports & activity"
        back="/workout"
        actions={
          <>
            <LinkButton href="/activity/track" size="sm" icon={<MapPin className="size-4" />}>
              Track with GPS
            </LinkButton>
            <LinkButton href="/activity/new" size="sm" variant="primary" icon={<Plus className="size-4" />}>
              Log activity
            </LinkButton>
          </>
        }
      />
      {favSports.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Your sports">
          {favSports.map((s) => (
            <LinkButton key={s} href={`/activity/new?type=${s}`} size="sm" variant="soft">
              {SPORTS[s].emoji} {SPORTS[s].label}
            </LinkButton>
          ))}
        </div>
      )}

      <Card>
        <SectionTitle>Steps</SectionTitle>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-36">
            <Field label="Day" htmlFor="sdt">
              <Input id="sdt" type="date" max={today} value={stepDate} onChange={(e) => setStepDate(e.target.value)} />
            </Field>
          </div>
          <div className="w-32">
            <Field label="Steps" htmlFor="stp">
              <Input id="stp" inputMode="numeric" value={stepVal} onChange={(e) => setStepVal(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          <Button variant="secondary" onClick={saveSteps} disabled={!stepVal}>
            Save
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Enter steps from your phone or watch, or <Link href="/settings/devices" className="underline">import them</Link>. We don&apos;t estimate steps you didn&apos;t record.
        </p>
      </Card>
      {steps && <DailyBarChart title="Steps" subtitle="Last 14 days" data={steps.map((s) => ({ date: s.date, value: s.steps }))} unit="steps" color="var(--activity)" target={me.targets.stepTarget} />}

      <Card>
        <SectionTitle action={<Link href="/settings/devices" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Upload className="size-4" /> Import GPX</Link>}>Recent activities</SectionTitle>
        {isLoading ? (
          <LoadingCards count={2} />
        ) : error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : !data?.length ? (
          <EmptyState title="No activities yet" action={<LinkButton href="/activity/new" variant="primary" size="sm">Log one</LinkButton>}>
            Football, a walk, a bike ride — everything counts.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((a) => (
              <li key={a.id}>
                <Link href={`/activity/${a.id}`} className="flex items-center gap-3 py-3 hover:underline">
                  <span className="text-xl" aria-hidden>
                    {SPORTS[a.type]?.emoji ?? "✨"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{sportLabel(a.type, a.customName)}</span>
                    <span className="text-xs text-muted">
                      {new Date(`${a.date}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })} · {formatDuration(a.durationMin)}
                      {a.distanceM ? ` · ${formatDistance(a.distanceM, units)}` : ""}
                    </span>
                  </span>
                  {a.source !== "manual" && <Badge tone="info">{a.source === "gps" ? "GPS" : "Imported"}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
