"use client";

import useSWR from "swr";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Play } from "lucide-react";
import { api, errorMessage, newClientId } from "@/lib/api";
import { localToday } from "@/lib/dates";
import type { Session, Template } from "@/lib/client-types";
import { PlanEditor } from "@/components/plan-editor";
import { Badge, Button, Card, ErrorState, LinkButton, LoadingCards, PageHeader, useFeedback } from "@/components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useFeedback();
  const { data: t, error, isLoading, mutate } = useSWR<Template>(`/api/workouts/templates/${id}`);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (isLoading) return <LoadingCards />;
  if (error || !t) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (editing)
    return (
      <>
        <PageHeader title="Edit plan" back={`/workout/plans/${id}`} />
        <PlanEditor initial={t} />
      </>
    );

  async function start() {
    setBusy(true);
    try {
      const s = await api.post<Session>("/api/workouts/sessions", { templateId: id, date: localToday(), clientId: newClientId() });
      router.push(`/workout/session/${s.id}`);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.name}
        subtitle={[t.location !== "any" && t.location, t.estDurationMin && `~${t.estDurationMin} min`, t.scheduledDays.length && t.scheduledDays.map((d) => DAYS[d]).join(", ")].filter(Boolean).join(" · ") || undefined}
        back="/workout"
        actions={
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)} icon={<Pencil className="size-4" />}>
            Edit
          </Button>
        }
      />
      {t.source !== "user" && <Badge tone="primary">{t.source === "ai" ? "Created with the AI coach" : "Generated"}</Badge>}
      {t.description && <p className="text-sm text-muted">{t.description}</p>}
      <Card>
        <ol className="divide-y divide-border">
          {t.items.map((i, n) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium">
                  {n + 1}. {i.exercise ? <a href={`/workout/exercises/${i.exercise.slug}`} className="hover:underline">{i.exercise.name}</a> : "Removed exercise"}
                </p>
                <p className="text-xs text-muted">
                  {i.sets} × {i.durationSec ? `${i.durationSec}s` : `${i.reps ?? "—"} reps`}
                  {i.weightKg ? ` @ ${i.weightKg} kg` : ""} · rest {i.restSec}s
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={start} loading={busy} icon={<Play className="size-4" />}>
          Start workout
        </Button>
        <LinkButton href={`/coach?q=${encodeURIComponent(`Adjust my workout plan "${t.name}"`)}`} size="lg" variant="ghost">
          AI adjust
        </LinkButton>
      </div>
    </div>
  );
}
