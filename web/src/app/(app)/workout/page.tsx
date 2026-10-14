"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, BookOpen, CalendarClock, History, Play, Plus, Sparkles, Wand2 } from "lucide-react";
import { api, errorMessage, newClientId } from "@/lib/api";
import { localToday, weekday } from "@/lib/dates";
import type { Dashboard, Session, TemplateListItem } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { Badge, Button, Card, EmptyState, ErrorState, LinkButton, LoadingCards, PageHeader, SectionTitle, useFeedback } from "@/components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WorkoutHome() {
  const { t } = useMe();
  const router = useRouter();
  const { toast } = useFeedback();
  const { data: dash } = useSWR<Dashboard>("/api/dashboard");
  const { data: plans, error, isLoading, mutate } = useSWR<TemplateListItem[]>("/api/workouts/templates");
  const [starting, setStarting] = useState<string | null>(null);
  const today = localToday();
  const dow = weekday(today);
  const todays = plans?.filter((p) => p.scheduledDays.includes(dow)) ?? [];
  const inProgress = dash?.workout.inProgress[0];

  async function start(templateId: string | null, name?: string) {
    setStarting(templateId ?? "empty");
    try {
      const s = await api.post<Session>("/api/workouts/sessions", { templateId, name, date: today, clientId: newClientId() });
      router.push(`/workout/session/${s.id}`);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
      setStarting(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.workout")} actions={<LinkButton href="/workout/history" size="sm" variant="ghost" icon={<History className="size-4" />}>{t("workout.history")}</LinkButton>} />

      <Card aria-labelledby="today-w">
        <SectionTitle id="today-w">Today&apos;s workout</SectionTitle>
        {inProgress ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-medium">{inProgress.name}</span> is in progress.
            </p>
            <LinkButton href={`/workout/session/${inProgress.id}`} variant="primary" icon={<Play className="size-4" />}>
              Continue
            </LinkButton>
          </div>
        ) : dash?.workout.completed.length ? (
          <p className="text-sm">
            ✓ Done today: <span className="font-medium">{dash.workout.completed.map((c) => c.name).join(", ")}</span>. Nice work — recovery matters too.
          </p>
        ) : todays.length ? (
          <div className="space-y-3">
            {todays.map((p) => (
              <div key={p.id} className="rounded-xl bg-surface-2/60 p-3">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted">
                  {p.exerciseCount} exercises{p.estDurationMin ? ` · ~${p.estDurationMin} min` : ""} · {p.location}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => start(p.id)} loading={starting === p.id} icon={<Play className="size-4" />}>
                    {t("workout.start")}
                  </Button>
                  <LinkButton href="/workout/generate" size="md" variant="secondary">
                    {t("workout.change")}
                  </LinkButton>
                  <LinkButton href={`/coach?q=${encodeURIComponent(`Adjust today's workout "${p.name}" for me`)}`} variant="ghost" icon={<Sparkles className="size-4" />}>
                    {t("workout.aiAdjust")}
                  </LinkButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">Nothing scheduled for {DAYS[dow]}. Rest days are part of the plan — or pick something below.</p>
            <div className="flex flex-wrap gap-2">
              <LinkButton href="/workout/generate" variant="primary" icon={<Wand2 className="size-4" />}>
                Generate a workout
              </LinkButton>
              <Button variant="secondary" onClick={() => start(null, "Workout")} loading={starting === "empty"} icon={<Plus className="size-4" />}>
                Empty workout
              </Button>
              <LinkButton href="/coach?q=Create+a+workout+for+me+today" variant="ghost" icon={<Sparkles className="size-4" />}>
                {t("workout.aiAdjust")}
              </LinkButton>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { href: "/workout/exercises", label: "Exercise library", icon: BookOpen },
          { href: "/workout/generate", label: "Workout generator", icon: Wand2 },
          { href: "/activity", label: "Sports & activity", icon: Activity },
          { href: "/workout/history", label: "History & PRs", icon: History },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-surface p-3 text-center text-sm font-medium hover:bg-surface-2">
            <l.icon className="size-5 text-primary" aria-hidden />
            {l.label}
          </Link>
        ))}
      </div>

      <Card aria-labelledby="plans">
        <SectionTitle id="plans" action={<LinkButton href="/workout/plans/new" size="sm" variant="soft" icon={<Plus className="size-4" />}>New plan</LinkButton>}>
          My workout plans
        </SectionTitle>
        {isLoading ? (
          <LoadingCards count={2} />
        ) : error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : !plans?.length ? (
          <EmptyState icon={<CalendarClock className="size-8" />} title="No plans yet" action={<LinkButton href="/workout/generate" variant="primary" size="sm">Generate your first plan</LinkButton>}>
            Create a plan from the exercise library or let the generator build one for your equipment and time.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <Link href={`/workout/plans/${p.id}`} className="min-w-0 flex-1 hover:underline">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.exerciseCount} exercises · {p.location}
                    {p.scheduledDays.length ? ` · ${p.scheduledDays.map((d) => DAYS[d]).join(", ")}` : ""}
                  </p>
                </Link>
                {p.source !== "user" && <Badge tone="primary">{p.source === "ai" ? "AI" : "Generated"}</Badge>}
                <Button size="sm" variant="secondary" onClick={() => start(p.id)} loading={starting === p.id} aria-label={`Start ${p.name}`}>
                  <Play className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
