"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { mutate as globalMutate } from "swr";
import { errorMessage } from "@/lib/api";
import { localToday } from "@/lib/dates";
import { SPORTS } from "@/lib/sports";
import { M_PER_MILE } from "@/lib/units";
import { useMe } from "@/components/me";
import { postOrQueue } from "@/components/offline";
import { Alert, Button, Card, Field, Input, PageHeader, Select, Textarea, useFeedback } from "@/components/ui";

function NewActivity() {
  const p = useSearchParams();
  const router = useRouter();
  const { units } = useMe();
  const { toast } = useFeedback();
  const [type, setType] = useState(p.get("type") && p.get("type")! in SPORTS ? p.get("type")! : "running");
  const [customName, setCustomName] = useState("");
  const [date, setDate] = useState(localToday());
  const [hours, setHours] = useState("0");
  const [mins, setMins] = useState("30");
  const [distance, setDistance] = useState("");
  const [elevation, setElevation] = useState("");
  const [hr, setHr] = useState("");
  const [calories, setCalories] = useState("");
  const [steps, setSteps] = useState("");
  const [intensity, setIntensity] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = SPORTS[type].metrics;
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  async function save() {
    setBusy(true);
    setError(null);
    const dist = n(distance);
    try {
      const r = await postOrQueue(
        "/api/activities",
        {
          type,
          customName: type === "custom" ? customName : null,
          date,
          durationMin: Number(hours || 0) * 60 + Number(mins || 0),
          distanceM: dist == null ? null : Math.round(units === "imperial" ? dist * M_PER_MILE : dist * 1000),
          elevationM: n(elevation),
          avgHr: n(hr),
          calories: n(calories),
          steps: n(steps),
          intensity: intensity || null,
          notes: notes || null,
          source: "manual",
        },
        SPORTS[type].label,
      );
      globalMutate((k) => typeof k === "string" && (k.startsWith("/api/activities") || k.startsWith("/api/dashboard")));
      toast({ tone: r.queued ? "info" : "success", text: r.queued ? "Saved offline — will sync when you're back online." : "Activity saved" });
      router.push("/activity");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Log an activity" back="/activity" />
      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Activity" htmlFor="at">
            <Select id="at" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(SPORTS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.emoji} {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="ad">
            <Input id="ad" type="date" max={localToday()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {type === "custom" && (
          <Field label="Activity name" htmlFor="acn">
            <Input id="acn" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Table tennis" maxLength={60} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hours" htmlFor="ah">
            <Input id="ah" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Minutes" htmlFor="am">
            <Input id="am" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {m.includes("distance") && (
            <Field label={`Distance (${units === "imperial" ? "mi" : "km"})`} htmlFor="adi" optional>
              <Input id="adi" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} />
            </Field>
          )}
          {m.includes("elevation") && (
            <Field label="Elevation gain (m)" htmlFor="ael" optional>
              <Input id="ael" inputMode="numeric" value={elevation} onChange={(e) => setElevation(e.target.value)} />
            </Field>
          )}
          {m.includes("heartRate") && (
            <Field label="Avg heart rate (bpm)" htmlFor="ahr" optional hint="From your watch, if you have one.">
              <Input id="ahr" inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} />
            </Field>
          )}
          {m.includes("calories") && (
            <Field label="Calories (from device)" htmlFor="acal" optional hint="We don't invent calorie burn — leave blank if unknown.">
              <Input id="acal" inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} />
            </Field>
          )}
          {m.includes("steps") && (
            <Field label="Steps" htmlFor="ast" optional>
              <Input id="ast" inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value)} />
            </Field>
          )}
          {m.includes("intensity") && (
            <Field label="How hard was it?" htmlFor="ai" optional>
              <Select id="ai" value={intensity} onChange={(e) => setIntensity(e.target.value)}>
                <option value="">—</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="vigorous">Vigorous</option>
              </Select>
            </Field>
          )}
        </div>
        <Field label="Notes" htmlFor="an" optional>
          <Textarea id="an" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button size="lg" className="w-full" onClick={save} loading={busy}>
          Save activity
        </Button>
      </Card>
    </div>
  );
}

export default function NewActivityPage() {
  return (
    <Suspense>
      <NewActivity />
    </Suspense>
  );
}
