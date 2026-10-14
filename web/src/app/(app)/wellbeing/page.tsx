"use client";

import useSWR from "swr";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { addDays, localToday } from "@/lib/dates";
import { formatDuration } from "@/lib/units";
import { useMe } from "@/components/me";
import { DailyBarChart } from "@/components/charts";
import { Alert, Badge, Button, Card, Field, InfoTip, Input, PageHeader, SectionTitle, Textarea, Toggle, cx, useFeedback } from "@/components/ui";

type SleepDay = { date: string; logged: boolean; id?: string; durationMin?: number; bedtime?: string; wakeTime?: string; quality?: number | null; source?: string; notes?: string | null };
type WbDay = { date: string; logged: boolean; mood?: number | null; energy?: number | null; stress?: number | null; recovery?: number | null; restDay?: boolean; notes?: string | null };

function Scale({ label, value, onChange, low, high }: { label: string; value: number | null; onChange: (v: number | null) => void; low: string; high: string }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex items-center gap-1.5">
        <span className="w-14 text-xs text-muted">{low}</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n} of 5`}
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={cx("size-10 rounded-full border text-sm font-medium", value === n ? "border-primary bg-primary text-on-primary" : "border-border hover:bg-surface-2")}
          >
            {n}
          </button>
        ))}
        <span className="w-14 text-right text-xs text-muted">{high}</span>
      </div>
    </fieldset>
  );
}

export default function WellbeingPage() {
  const { me } = useMe();
  const { toast } = useFeedback();
  const today = localToday();
  const { data: sleep, mutate: mutateSleep } = useSWR<SleepDay[]>(`/api/sleep?start=${addDays(today, -13)}&end=${today}`);
  const { data: wb, mutate: mutateWb } = useSWR<WbDay[]>(`/api/wellbeing?start=${addDays(today, -13)}&end=${today}`);

  const [sleepDate, setSleepDate] = useState(today);
  const [bed, setBed] = useState(me.preferences.bedtime ?? "23:00");
  const [wake, setWake] = useState(me.preferences.wakeTime ?? "07:00");
  const [quality, setQuality] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [recovery, setRecovery] = useState<number | null>(null);
  const [restDay, setRestDay] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Pre-fill today's check-in if it exists.
  const todayWb = wb?.find((d) => d.date === today);
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && todayWb?.logged) {
    setPrefilled(true);
    setMood(todayWb.mood ?? null);
    setEnergy(todayWb.energy ?? null);
    setStress(todayWb.stress ?? null);
    setRecovery(todayWb.recovery ?? null);
    setRestDay(!!todayWb.restDay);
    setNotes(todayWb.notes ?? "");
  }

  async function saveSleep() {
    setBusy("sleep");
    try {
      await api.post("/api/sleep", { date: sleepDate, bedtime: bed, wakeTime: wake, quality });
      toast({ tone: "success", text: "Sleep saved" });
      mutateSleep();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }
  async function saveCheckIn() {
    setBusy("wb");
    try {
      await api.post("/api/wellbeing", { date: today, mood, energy, stress, recovery, restDay, notes: notes || null });
      toast({ tone: "success", text: "Check-in saved" });
      mutateWb();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }
  async function deleteSleep(id: string) {
    try {
      await api.del(`/api/sleep/${id}`);
      mutateSleep();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }

  const tracksSleep = me.settings.trackingCategories.includes("sleep");
  const tracksWb = me.settings.trackingCategories.includes("wellbeing");

  return (
    <div className="space-y-4">
      <PageHeader title="Sleep & wellbeing" subtitle="Everything here is optional" back="/" />
      <Alert tone="info">This is wellness information, not a medical assessment. If you&apos;re struggling with sleep, mood or stress for a while, talking to a doctor or someone you trust can really help.</Alert>

      {tracksSleep && (
        <Card className="space-y-4">
          <SectionTitle>Log sleep</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Woke up on" htmlFor="sd">
              <Input id="sd" type="date" value={sleepDate} max={today} onChange={(e) => setSleepDate(e.target.value)} />
            </Field>
            <Field label="Bedtime" htmlFor="bt">
              <Input id="bt" type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
            </Field>
            <Field label="Wake time" htmlFor="wt">
              <Input id="wt" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
            </Field>
          </div>
          <Scale label="How did you sleep?" value={quality} onChange={setQuality} low="Poorly" high="Great" />
          <Button onClick={saveSleep} loading={busy === "sleep"}>
            Save sleep
          </Button>
        </Card>
      )}

      {tracksSleep && sleep && (
        <>
          <DailyBarChart
            title="Sleep duration"
            subtitle="Last 14 nights"
            data={sleep.map((s) => ({ date: s.date, value: s.logged ? Math.round((s.durationMin! / 60) * 10) / 10 : null }))}
            unit="h"
            color="var(--sleep)"
            target={me.targets.sleepTargetMin ? me.targets.sleepTargetMin / 60 : null}
            format={(v) => (Math.round(v * 10) / 10).toString()}
          />
          <Card>
            <SectionTitle>Recent nights</SectionTitle>
            <ul className="divide-y divide-border text-sm">
              {sleep
                .filter((s) => s.logged)
                .reverse()
                .slice(0, 7)
                .map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {new Date(`${s.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · {s.bedtime}–{s.wakeTime}
                    </span>
                    <span className="flex items-center gap-2">
                      {formatDuration(s.durationMin)}
                      {s.source !== "manual" && <Badge tone="info">Imported</Badge>}
                      <button onClick={() => deleteSleep(s.id!)} className="text-xs text-muted underline">
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              {!sleep.some((s) => s.logged) && <li className="py-2 text-muted">No nights logged yet.</li>}
            </ul>
          </Card>
        </>
      )}

      {tracksWb && (
        <Card className="space-y-4">
          <SectionTitle action={<InfoTip term="recovery" />}>Today&apos;s check-in</SectionTitle>
          <p className="text-sm text-muted">Fill in only what you want. Skipping is completely fine.</p>
          <Scale label="Mood" value={mood} onChange={setMood} low="Low" high="Great" />
          <Scale label="Energy" value={energy} onChange={setEnergy} low="Drained" high="Energetic" />
          <Scale label="Stress" value={stress} onChange={setStress} low="Calm" high="Very stressed" />
          <Scale label="Body recovery" value={recovery} onChange={setRecovery} low="Sore" high="Fresh" />
          <Toggle label="Today is a rest day" description="Rest is part of training — it counts toward recovery." checked={restDay} onChange={setRestDay} />
          <Field label="Private note" htmlFor="wn" optional hint="Encrypted. Only you can see it.">
            <Textarea id="wn" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </Field>
          <Button onClick={saveCheckIn} loading={busy === "wb"}>
            Save check-in
          </Button>
        </Card>
      )}

      {tracksWb && wb && wb.some((d) => d.logged && d.energy) && (
        <DailyBarChart title="Energy" subtitle="Self-rated, 1–5" data={wb.map((d) => ({ date: d.date, value: d.logged ? (d.energy ?? null) : null }))} unit="/ 5" color="var(--primary)" />
      )}
      {!tracksSleep && !tracksWb && <Alert tone="info">Sleep and wellbeing tracking are turned off. You can enable them in Settings → Tracking.</Alert>}
    </div>
  );
}
