"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { Activity, BedDouble, ChevronRight, Dumbbell, Footprints, Moon, Plus, Sparkles, Target, Utensils, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { AiStatus, Dashboard, DailyInsight } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { QuickWater } from "@/components/quick-water";
import { Alert, Badge, Button, Card, cx, EmptyState, ErrorState, InfoTip, LinkButton, LoadingCards, ProgressBar, Ring, SectionTitle, useFeedback } from "@/components/ui";
import { formatDistance, formatDuration, formatVolume } from "@/lib/units";
import { sportLabel } from "@/lib/sports";

function greetingKey(hour: number) {
  return hour < 12 ? "greeting.morning" : hour < 18 ? "greeting.afternoon" : "greeting.evening";
}

function Metric({ label, current, target, unit, color, href, missingText, estimate, term }: { label: string; current: number | null; target: number | null; unit: string; color: string; href: string; missingText?: string; estimate?: boolean; term?: Parameters<typeof InfoTip>[0]["term"] }) {
  const pct = current != null && target ? Math.round((current / target) * 100) : null;
  return (
    <div className="rounded-xl bg-surface-2/60 p-3">
      <div className="flex items-center justify-between">
        <Link href={href} className="text-sm font-medium hover:underline">
          {label}
        </Link>
        <div className="flex items-center">
          {estimate && <Badge tone="warning">≈</Badge>}
          {term && <InfoTip term={term} />}
        </div>
      </div>
      {current == null ? (
        <p className="mt-1 text-sm text-muted">{missingText ?? "Not logged yet"}</p>
      ) : (
        <>
          <p className="tabular mt-1 text-lg font-semibold">
            {Math.round(current).toLocaleString()}
            <span className="text-sm font-normal text-muted">
              {target ? ` / ${target.toLocaleString()}` : ""} {unit}
            </span>
          </p>
          <ProgressBar value={current} max={target} color={color} label={label} className="mt-2" />
          <p className="mt-1 text-xs text-muted">{pct != null ? `${pct}% of target` : "No target set"}</p>
        </>
      )}
    </div>
  );
}

function InsightCard() {
  const { data: status } = useSWR<AiStatus>("/api/ai/status");
  const { me } = useMe();
  const enabled = me.settings.aiEnabled && me.settings.dailyInsight && status?.configured;
  const { data, error, isLoading, mutate } = useSWR<DailyInsight>(enabled ? "/api/ai/insight" : null, { revalidateOnFocus: false });
  const [refreshing, setRefreshing] = useState(false);
  if (!me.settings.dailyInsight || !me.settings.aiEnabled) return null;
  return (
    <Card aria-labelledby="insight-title" className="border-primary/30 bg-primary-soft/40">
      <SectionTitle
        id="insight-title"
        action={
          enabled && (
            <Button
              size="sm"
              variant="ghost"
              loading={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await mutate(await api.get<DailyInsight>("/api/ai/insight?refresh=1"), false);
                } catch {
                  /* error shown below on next load */
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              Refresh
            </Button>
          )
        }
      >
        <span className="inline-flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden /> AI insight <Badge tone="primary">AI-generated</Badge>
        </span>
      </SectionTitle>
      {!status ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !status.configured ? (
        <p className="text-sm text-muted">AI insights aren&apos;t available on this server yet (no AI provider configured). Everything else works normally.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted">Thinking about your day…</p>
      ) : error ? (
        <p className="text-sm text-muted">{errorMessage(error)}</p>
      ) : data && "insight" in data && data.insight ? (
        <p className="text-sm leading-relaxed">{String(data.insight)}</p>
      ) : (
        <p className="text-sm text-muted">No insight right now.</p>
      )}
      <p className="mt-2 text-xs text-muted">General wellness information based on what you&apos;ve logged — not medical advice.</p>
    </Card>
  );
}

export default function HomePage() {
  const { me, t, units } = useMe();
  const { data, error, isLoading, mutate } = useSWR<Dashboard>("/api/dashboard");
  const { toast } = useFeedback();
  if (isLoading) return <LoadingCards count={4} />;
  if (error || !data) return <ErrorState error={error} onRetry={() => mutate()} />;
  const w = new Set(data.widgets);
  const track = new Set(data.trackingCategories);
  const n = data.nutrition;

  async function dismiss(key: string) {
    try {
      await api.post("/api/recommendations/dismiss", { key });
      mutate();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t(greetingKey(data.hour) as "greeting.morning")}
          {data.name ? `, ${data.name}` : ""}
        </h1>
        <p className="text-sm text-muted">{new Date(`${data.today}T12:00:00Z`).toLocaleDateString(me.profile.language, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</p>
      </div>

      {data.recommendations.length > 0 && (
        <ul className="space-y-2" aria-label="Suggestions">
          {data.recommendations.map((r) => (
            <li key={r.key} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="text-sm text-muted">{r.body}</p>
                {r.action && (
                  <Link href={r.action.href} className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
                    {r.action.label}
                  </Link>
                )}
              </div>
              <button onClick={() => dismiss(r.key)} aria-label={`Dismiss ${r.title} suggestion`} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Today's overview */}
      <Card aria-labelledby="ov">
        <SectionTitle id="ov" action={<Link href="/settings/dashboard" className="text-xs text-muted hover:underline">Customise</Link>}>
          {t("home.overview")}
        </SectionTitle>
        {track.has("nutrition") && w.has("calories") && (
          <div className="mb-4 flex items-center gap-4">
            <Ring value={n.kcal.current} max={n.kcal.target} size={104} color="var(--kcal)" label="Calories">
              <span className="tabular text-xl font-semibold">{Math.round(n.kcal.current)}</span>
              <span className="text-[11px] text-muted">{n.kcal.target ? `of ${n.kcal.target}` : "kcal"}</span>
            </Ring>
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <p className="flex items-center gap-1 font-medium">
                {t("metric.calories")} <InfoTip term="calories" />
              </p>
              {n.entries === 0 ? (
                <p className="text-muted">Nothing logged yet today.</p>
              ) : (
                <p className="text-muted">
                  {n.entries} item{n.entries === 1 ? "" : "s"} logged{n.estimates ? ` · ${n.estimates} estimated` : ""}
                  {n.kcal.missing ? ` · ${n.kcal.missing} without calorie data` : ""}
                </p>
              )}
              {n.kcal.target && data.targetsSource === "calculated" && <p className="text-xs text-muted">Target is an estimate. <Link href="/settings/targets" className="underline">Adjust</Link></p>}
              <LinkButton href="/nutrition/add" size="sm" variant="soft" icon={<Plus className="size-4" />}>
                {t("nutrition.addFood")}
              </LinkButton>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {track.has("nutrition") && w.has("protein") && <Metric label={t("metric.protein")} current={n.entries ? n.proteinG.current : null} target={n.proteinG.target} unit="g" color="var(--protein)" href="/nutrition" term="protein" />}
          {track.has("hydration") && w.has("water") && (
            <Metric label={t("metric.water")} current={data.water.current} target={data.water.target} unit={units === "imperial" ? "ml" : "ml"} color="var(--water)" href="/hydration" />
          )}
          {track.has("activity") && w.has("steps") && <Metric label={t("metric.steps")} current={data.steps.current} target={data.steps.target} unit="" color="var(--activity)" href="/activity" missingText="No steps recorded" />}
          {track.has("sleep") && w.has("sleep") && (
            <Metric label={t("metric.sleep")} current={data.sleep ? Math.round((data.sleep.durationMin / 60) * 10) / 10 : null} target={data.sleep?.target ? data.sleep.target / 60 : null} unit="h" color="var(--sleep)" href="/wellbeing" missingText="Not logged" />
          )}
        </div>
        {track.has("hydration") && w.has("water") && (
          <div className="mt-3">
            <QuickWater date={data.today} onChange={() => mutate()} />
          </div>
        )}
      </Card>

      {w.has("insight") && <InsightCard />}

      {/* Today's plan */}
      <Card aria-labelledby="plan">
        <SectionTitle id="plan">{t("home.plan")}</SectionTitle>
        <ul className="divide-y divide-border">
          {track.has("workouts") && w.has("workout") && (
            <li className="flex items-center gap-3 py-3">
              <Dumbbell className="size-5 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Workout</p>
                <p className="truncate text-sm text-muted">
                  {data.workout.completed.length
                    ? `Done: ${data.workout.completed.map((s) => s.name).join(", ")}`
                    : data.workout.inProgress.length
                      ? `In progress: ${data.workout.inProgress[0].name}`
                      : data.workout.scheduled.length
                        ? `Planned: ${data.workout.scheduled.map((s) => s.name).join(", ")}`
                        : "Nothing planned — rest days count too."}
                </p>
              </div>
              <LinkButton href={data.workout.inProgress[0] ? `/workout/session/${data.workout.inProgress[0].id}` : "/workout"} size="sm" variant="secondary">
                {data.workout.inProgress.length ? "Continue" : data.workout.completed.length ? "View" : "Open"}
              </LinkButton>
            </li>
          )}
          {track.has("nutrition") && (
            <li className="flex items-center gap-3 py-3">
              <Utensils className="size-5 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Meals</p>
                <p className="text-sm text-muted">
                  {(["breakfast", "lunch", "dinner", "snack"] as const).map((m) => (n.mealsLogged[m] ? `${t(`meal.${m}`)} ✓` : t(`meal.${m}`))).join(" · ")}
                </p>
              </div>
              <LinkButton href="/nutrition" size="sm" variant="secondary">
                Log
              </LinkButton>
            </li>
          )}
          {track.has("activity") && (
            <li className="flex items-center gap-3 py-3">
              <Activity className="size-5 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Activity</p>
                <p className="truncate text-sm text-muted">
                  {data.activity.sessions.length
                    ? data.activity.sessions.map((a) => `${sportLabel(a.type, a.customName)} ${formatDuration(a.durationMin)}${a.distanceM ? ` · ${formatDistance(a.distanceM, units)}` : ""}`).join(", ")
                    : data.activity.minutes
                      ? `${data.activity.minutes} active minutes`
                      : "No activity logged yet"}
                </p>
              </div>
              <LinkButton href="/activity/new" size="sm" variant="secondary">
                Add
              </LinkButton>
            </li>
          )}
        </ul>
      </Card>

      {/* Wellbeing */}
      {(track.has("sleep") || track.has("wellbeing")) && (
        <Card aria-labelledby="wb">
          <SectionTitle id="wb" action={<Link href="/wellbeing" className="text-sm text-primary hover:underline">Check in</Link>}>
            {t("home.wellbeing")}
          </SectionTitle>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-surface-2/60 p-3">
              <Moon className="mx-auto size-5 text-sleep" aria-hidden />
              <p className="mt-1 text-xs text-muted">Sleep</p>
              <p className="text-sm font-semibold">{data.sleep ? formatDuration(data.sleep.durationMin) : "—"}</p>
            </div>
            <div className="rounded-xl bg-surface-2/60 p-3">
              <BedDouble className="mx-auto size-5 text-primary" aria-hidden />
              <p className="mt-1 text-xs text-muted">Energy</p>
              <p className="text-sm font-semibold">{data.wellbeing?.energy ? `${data.wellbeing.energy}/5` : "—"}</p>
            </div>
            <div className="rounded-xl bg-surface-2/60 p-3">
              <Footprints className="mx-auto size-5 text-activity" aria-hidden />
              <p className="mt-1 flex items-center justify-center text-xs text-muted">
                Recovery <InfoTip term="recovery" />
              </p>
              <p className={cx("text-sm font-semibold", data.recovery.status === "take_it_easy" && "text-warning")}>
                {{ good: "Good", moderate: "Moderate", take_it_easy: "Go easy", unknown: "—" }[data.recovery.status]}
              </p>
            </div>
          </div>
          {data.recovery.status !== "unknown" && <p className="mt-2 text-xs text-muted">≈ {data.recovery.note}</p>}
          {data.recovery.status === "unknown" && <p className="mt-2 text-xs text-muted">{data.recovery.note}</p>}
        </Card>
      )}

      {/* Goals */}
      {w.has("goals") && (
        <Card aria-labelledby="goals">
          <SectionTitle id="goals" action={<Link href="/progress/goals" className="text-sm text-primary hover:underline">All goals</Link>}>
            <span className="inline-flex items-center gap-2">
              <Target className="size-4" aria-hidden /> {t("home.progress")}
            </span>
          </SectionTitle>
          {data.goals.total === 0 ? (
            <EmptyState title="No goals yet" action={<LinkButton href="/progress/goals" size="sm" variant="soft">Set a goal</LinkButton>}>
              Small, flexible goals help you stay consistent.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {data.goals.items.map((g) => (
                <li key={g.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{g.title}</span>
                    <span className="text-muted">{g.met ? "✓ Done" : `${g.percent}%`}</span>
                  </div>
                  <ProgressBar value={g.current} max={g.target} label={g.title} className="mt-1" color={g.met ? "var(--success)" : "var(--primary)"} />
                  <p className="mt-0.5 text-xs text-muted">{g.label}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <LinkButton href="/hydration" variant="secondary" className="justify-between">
          Hydration ({formatVolume(data.water.current, units)}) <ChevronRight className="size-4" />
        </LinkButton>
        <LinkButton href="/wellbeing" variant="secondary" className="justify-between">
          Sleep & mood <ChevronRight className="size-4" />
        </LinkButton>
      </div>
      {me.profile.isMinor && <Alert tone="info">Tip: growing bodies need plenty of energy. Focus on regular meals, activities you enjoy, and good sleep.</Alert>}
    </div>
  );
}
