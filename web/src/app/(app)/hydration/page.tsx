"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { addDays, localToday } from "@/lib/dates";
import { flOzToMl, formatVolume, mlToFlOz } from "@/lib/units";
import { useMe } from "@/components/me";
import { QuickWater } from "@/components/quick-water";
import { postOrQueue } from "@/components/offline";
import { DailyBarChart } from "@/components/charts";
import { Button, Card, ErrorState, Field, Input, LoadingCards, PageHeader, Ring, SectionTitle, Select, useFeedback } from "@/components/ui";

type Day = { date: string; totalMl: number; targetMl: number; entries: { id: string; amountMl: number; drink: string; loggedAt: string; source: string }[] };

export default function HydrationPage() {
  const { units, me, mutate: mutateMe } = useMe();
  const { toast } = useFeedback();
  const today = localToday();
  const { data, error, isLoading, mutate } = useSWR<Day>(`/api/water?date=${today}`);
  const { data: week, mutate: mutateWeek } = useSWR<{ date: string; ml: number | null }[]>(`/api/water?start=${addDays(today, -6)}&end=${today}`);
  const [custom, setCustom] = useState("");
  const [drink, setDrink] = useState("water");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    mutate();
    mutateWeek();
  };

  async function addCustom() {
    const n = Number(custom.replace(",", "."));
    if (!(n > 0)) return;
    const ml = Math.round(units === "imperial" ? flOzToMl(n) : n);
    setBusy(true);
    try {
      const r = await postOrQueue("/api/water", { date: today, amountMl: ml, drink }, `${ml} ml ${drink}`);
      toast({ tone: r.queued ? "info" : "success", text: r.queued ? "Saved offline — will sync later." : `Added ${formatVolume(ml, units)}` });
      setCustom("");
      refresh();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await api.del(`/api/water/${id}`);
      refresh();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }
  async function saveTarget() {
    const n = Number(target);
    if (!(n > 0)) return;
    const ml = Math.round(units === "imperial" ? flOzToMl(n) : n);
    try {
      await api.patch("/api/me/targets", { waterTargetMl: ml, targetsSource: "custom" });
      await mutateMe();
      refresh();
      setTarget("");
      toast({ tone: "success", text: "Daily water target updated" });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }

  if (isLoading) return <LoadingCards />;
  if (error || !data) return <ErrorState error={error} onRetry={() => mutate()} />;
  return (
    <div className="space-y-4">
      <PageHeader title="Hydration" back="/" />
      <Card className="flex flex-col items-center gap-4 sm:flex-row">
        <Ring value={data.totalMl} max={data.targetMl} size={140} stroke={12} color="var(--water)" label="Water today">
          <span className="tabular text-2xl font-semibold">{formatVolume(data.totalMl, units)}</span>
          <span className="text-xs text-muted">of {formatVolume(data.targetMl, units)}</span>
        </Ring>
        <div className="flex-1 space-y-3">
          <p className="text-sm text-muted">{data.totalMl >= data.targetMl ? "You've reached today's target. 🎉" : `${formatVolume(data.targetMl - data.totalMl, units)} to go. Needs vary with heat and activity — the target is a guide, not a rule.`}</p>
          <QuickWater date={today} onChange={refresh} />
          <div className="flex items-end gap-2">
            <div className="w-28">
              <Field label={`Custom (${units === "imperial" ? "fl oz" : "ml"})`} htmlFor="cw">
                <Input id="cw" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} />
              </Field>
            </div>
            <div className="w-32">
              <Field label="Drink" htmlFor="dk">
                <Select id="dk" value={drink} onChange={(e) => setDrink(e.target.value)}>
                  {["water", "sparkling water", "tea", "coffee", "milk", "juice", "other"].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button onClick={addCustom} loading={busy} variant="secondary">
              Add
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Today&apos;s entries</SectionTitle>
        {data.entries.length === 0 ? (
          <p className="text-sm text-muted">Nothing logged yet today.</p>
        ) : (
          <ul className="divide-y divide-border">
            {[...data.entries].reverse().map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {formatVolume(e.amountMl, units)} <span className="text-muted">{e.drink}</span>
                </span>
                <span className="flex items-center gap-2 text-muted">
                  {new Date(e.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  <button onClick={() => remove(e.id)} aria-label={`Delete ${e.amountMl} ml entry`} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-2">
                    <Trash2 className="size-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {week && <DailyBarChart title="Last 7 days" data={week.map((d) => ({ date: d.date, value: d.ml == null ? null : units === "imperial" ? mlToFlOz(d.ml) : d.ml }))} unit={units === "imperial" ? "fl oz" : "ml"} color="var(--water)" target={units === "imperial" ? mlToFlOz(data.targetMl) : data.targetMl} />}

      <Card className="space-y-3">
        <SectionTitle>Daily target</SectionTitle>
        <p className="text-sm text-muted">
          Current: {formatVolume(data.targetMl, units)} ({me.targets.targetsSource === "custom" ? "set by you" : "suggested from your profile"}).
        </p>
        <div className="flex items-end gap-2">
          <div className="w-36">
            <Field label={`New target (${units === "imperial" ? "fl oz" : "ml"})`} htmlFor="wt">
              <Input id="wt" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
          </div>
          <Button variant="secondary" onClick={saveTarget}>
            Save
          </Button>
        </div>
        <Link href="/settings/notifications" className="text-sm text-primary hover:underline">
          Set up water reminders
        </Link>
      </Card>
    </div>
  );
}
