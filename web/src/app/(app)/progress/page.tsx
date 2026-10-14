"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { Award, Dumbbell, Sparkles, Target } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { addDays, diffDays, localToday, rangeFor } from "@/lib/dates";
import { formatDuration, mlToFlOz } from "@/lib/units";
import type { AiStatus, Progress, WeeklyReview } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { DailyBarChart, MacroChart, RangePicker } from "@/components/charts";
import { Badge, Button, Card, ErrorState, Field, Input, LinkButton, LoadingCards, PageHeader, SectionTitle, Stat, useFeedback } from "@/components/ui";

function WeeklyReviewCard() {
  const { me } = useMe();
  const { toast } = useFeedback();
  const { data: ai } = useSWR<AiStatus>("/api/ai/status");
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me.settings.weeklyReview) return null;
  async function load(refresh = false) {
    setBusy(true);
    try {
      setReview(await api.get<WeeklyReview>(`/api/ai/weekly${refresh ? "?refresh=1" : ""}`));
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  const r = review && "review" in review ? (review.review as { wentWell: string[]; trends: string[]; areasToImprove: string[]; nextWeek: string[] } | null) : null;
  return (
    <Card aria-labelledby="wr" className="border-primary/30">
      <SectionTitle id="wr" action={<Badge tone="primary">AI-generated</Badge>}>
        <span className="inline-flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden /> Weekly review
        </span>
      </SectionTitle>
      {!ai?.configured ? (
        <p className="text-sm text-muted">AI isn&apos;t configured on this server, so the written review isn&apos;t available. Your charts below show the same data.</p>
      ) : !me.settings.aiEnabled ? (
        <p className="text-sm text-muted">AI features are turned off in your privacy settings.</p>
      ) : !review ? (
        <Button variant="soft" onClick={() => load()} loading={busy}>
          Show last week&apos;s review
        </Button>
      ) : !r ? (
        <p className="text-sm text-muted">No review available.</p>
      ) : (
        <div className="space-y-3 text-sm">
          {(
            [
              ["What went well", r.wentWell],
              ["Trends", r.trends],
              ["Areas to improve", r.areasToImprove],
              ["Next week", r.nextWeek],
            ] as const
          ).map(([t, items]) =>
            items.length ? (
              <div key={t}>
                <h3 className="font-semibold">{t}</h3>
                <ul className="list-disc space-y-0.5 pl-5 text-muted">
                  {items.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">Based on your logged data for {"metrics" in review ? `${review.metrics.week.start} – ${review.metrics.week.end}` : "last week"}. Not medical advice.</p>
            <Button size="sm" variant="ghost" onClick={() => load(true)} loading={busy}>
              Regenerate
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function ProgressPage() {
  const { me, units } = useMe();
  const today = localToday();
  const [range, setRange] = useState("week");
  const [cStart, setCStart] = useState(addDays(today, -13));
  const [cEnd, setCEnd] = useState(today);
  const r = range === "custom" ? { start: cStart, end: cEnd } : rangeFor(range as "week" | "month" | "year", today);
  const valid = r.start <= r.end && diffDays(r.start, r.end) <= 400;
  const { data, error, isLoading, mutate } = useSWR<Progress>(valid ? `/api/progress?start=${r.start}&end=${r.end}` : null);
  const t = me.targets;
  const track = new Set(me.settings.trackingCategories);

  // For a year, aggregate bars into weeks so the chart stays readable (averages over logged days).
  const days = data?.days ?? [];
  const bucket = (key: keyof Progress["days"][number]) => {
    if (range !== "year") return days.map((d) => ({ date: d.date, value: d[key] as number | null }));
    const out: { date: string; value: number | null }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7).map((d) => d[key] as number | null).filter((v): v is number => v != null);
      out.push({ date: days[i].date, value: chunk.length ? chunk.reduce((a, b) => a + b, 0) / chunk.length : null });
    }
    return out;
  };
  const per = range === "year" ? "Weekly averages" : undefined;

  return (
    <div className="space-y-4">
      <PageHeader title="Progress" />
      <div className="grid grid-cols-3 gap-2">
        <LinkButton href="/progress/goals" icon={<Target className="size-4" />}>
          Goals
        </LinkButton>
        <LinkButton href="/progress/rewards" icon={<Award className="size-4" />}>
          Rewards
        </LinkButton>
        <LinkButton href="/progress/strength" icon={<Dumbbell className="size-4" />}>
          Strength
        </LinkButton>
      </div>
      <WeeklyReviewCard />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <RangePicker value={range} onChange={setRange} />
        {range === "custom" && (
          <div className="flex gap-2">
            <Field label="From" htmlFor="cs">
              <Input id="cs" type="date" max={cEnd} value={cStart} onChange={(e) => setCStart(e.target.value)} />
            </Field>
            <Field label="To" htmlFor="ce">
              <Input id="ce" type="date" max={today} value={cEnd} onChange={(e) => setCEnd(e.target.value)} />
            </Field>
          </div>
        )}
      </div>
      {!valid ? (
        <p className="text-sm text-danger">Please choose a start date before the end date, within about a year.</p>
      ) : isLoading ? (
        <LoadingCards count={4} />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : (
        <>
          <Card>
            <SectionTitle>Summary</SectionTitle>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Workouts" value={data.summary.workouts} />
              <Stat label="Active minutes" value={data.summary.activityMin} />
              <Stat label="Avg water" value={data.summary.avgWaterMl != null ? `${units === "imperial" ? Math.round(mlToFlOz(data.summary.avgWaterMl)) + " fl oz" : data.summary.avgWaterMl + " ml"}` : "—"} sub={`${data.summary.daysLogged.water} day${data.summary.daysLogged.water === 1 ? "" : "s"} logged`} />
              <Stat label="Avg steps" value={data.summary.avgSteps?.toLocaleString() ?? "—"} sub={`${data.summary.daysLogged.steps} day${data.summary.daysLogged.steps === 1 ? "" : "s"} logged`} />
              <Stat label="Avg sleep" value={data.summary.avgSleepMin != null ? formatDuration(data.summary.avgSleepMin) : "—"} sub={data.summary.bedtimeVariabilityMin != null ? `bedtime varies ±${data.summary.bedtimeVariabilityMin} min` : undefined} />
              <Stat label="Nutrition consistency" value={`${data.summary.nutritionConsistency ?? 0}%`} sub="of days with food logged" />
              {data.summary.avgKcal != null && <Stat label="Avg calories" value={`${data.summary.avgKcal} kcal`} sub="on logged days" />}
              {data.summary.avgProteinG != null && <Stat label="Avg protein" value={`${data.summary.avgProteinG} g`} />}
              {data.summary.totalVolumeKg > 0 && <Stat label="Training volume" value={`${data.summary.totalVolumeKg.toLocaleString()} kg`} />}
            </div>
            <p className="mt-3 text-xs text-muted">Averages only include days you logged — missing days aren&apos;t counted as zero.</p>
          </Card>

          {track.has("nutrition") && (
            <>
              <DailyBarChart title="Calories" subtitle={per} data={bucket("kcal")} unit="kcal" color="var(--kcal)" target={t.calorieTarget} />
              {range !== "year" && <MacroChart data={days.map((d) => ({ date: d.date, proteinG: d.proteinG, carbsG: d.carbsG, fatG: d.fatG }))} />}
            </>
          )}
          {track.has("hydration") && <DailyBarChart title="Water" subtitle={per} data={bucket("waterMl").map((p) => ({ ...p, value: p.value == null ? null : units === "imperial" ? mlToFlOz(p.value) : p.value }))} unit={units === "imperial" ? "fl oz" : "ml"} color="var(--water)" target={units === "imperial" ? mlToFlOz(t.waterTargetMl) : t.waterTargetMl} />}
          {track.has("activity") && <DailyBarChart title="Steps" subtitle={per} data={bucket("steps")} unit="steps" color="var(--activity)" target={t.stepTarget} />}
          {track.has("sleep") && (
            <DailyBarChart title="Sleep" subtitle={per} data={bucket("sleepMin").map((p) => ({ ...p, value: p.value == null ? null : Math.round((p.value / 60) * 10) / 10 }))} unit="h" color="var(--sleep)" target={t.sleepTargetMin ? t.sleepTargetMin / 60 : null} format={(v) => (Math.round(v * 10) / 10).toString()} />
          )}
          {track.has("workouts") && <DailyBarChart title="Workouts & activity minutes" subtitle={per} data={bucket("activityMin").map((p) => ({ ...p, value: p.value || null }))} unit="min" color="var(--primary)" />}
          {track.has("wellbeing") && days.some((d) => d.mood != null) && <DailyBarChart title="Mood" subtitle="Self-rated 1–5" data={bucket("mood")} unit="/ 5" color="var(--sleep)" format={(v) => (Math.round(v * 10) / 10).toString()} />}
          <DailyBarChart title="Daily goals met" subtitle="Water, steps and sleep targets you tracked that day" data={days.map((d) => ({ date: d.date, value: d.goalsTracked ? d.goalsMet : null }))} unit="goals" color="var(--success)" />
          {data.summary.sportBreakdown.length > 0 && (
            <Card>
              <SectionTitle>Sports</SectionTitle>
              <ul className="space-y-1 text-sm">
                {data.summary.sportBreakdown
                  .sort((a, b) => b.minutes - a.minutes)
                  .map((s) => (
                    <li key={s.type} className="flex justify-between">
                      <span className="capitalize">{s.type.replace("_", " ")}</span>
                      <span className="tabular text-muted">{formatDuration(s.minutes)}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
          <p className="text-center text-xs text-muted">
            Tap a bar to see that day. Use “Table” on any chart for exact values. <Link href="/nutrition" className="underline">Open a day in the diary</Link>
          </p>
        </>
      )}
    </div>
  );
}
