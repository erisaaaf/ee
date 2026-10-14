"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useMe, type Me } from "@/components/me";
import { Alert, Button, Card, EstimateBadge, Field, InfoTip, Input, PageHeader, SectionTitle, useFeedback } from "@/components/ui";

export default function TargetsSettings() {
  const { me, mutate } = useMe();
  const { toast } = useFeedback();
  const t = me.targets;
  const e = me.energy;
  const [vals, setVals] = useState({
    calorieTarget: t.calorieTarget?.toString() ?? "",
    proteinTargetG: t.proteinTargetG?.toString() ?? "",
    carbTargetG: t.carbTargetG?.toString() ?? "",
    fatTargetG: t.fatTargetG?.toString() ?? "",
    fiberTargetG: t.fiberTargetG?.toString() ?? "",
    waterTargetMl: t.waterTargetMl.toString(),
    stepTarget: t.stepTarget?.toString() ?? "",
    sleepTargetMin: t.sleepTargetMin ? String(t.sleepTargetMin / 60) : "",
    workoutsPerWeek: t.workoutsPerWeek?.toString() ?? "",
  });
  const [busy, setBusy] = useState(false);
  const n = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));

  async function save(source: "custom" | "calculated") {
    setBusy(true);
    try {
      const body =
        source === "calculated"
          ? { targetsSource: "calculated" }
          : {
              targetsSource: "custom",
              calorieTarget: n(vals.calorieTarget),
              proteinTargetG: n(vals.proteinTargetG),
              carbTargetG: n(vals.carbTargetG),
              fatTargetG: n(vals.fatTargetG),
              fiberTargetG: n(vals.fiberTargetG),
              waterTargetMl: n(vals.waterTargetMl) ?? 2000,
              stepTarget: n(vals.stepTarget),
              sleepTargetMin: vals.sleepTargetMin ? Math.round(Number(vals.sleepTargetMin) * 60) : null,
              workoutsPerWeek: n(vals.workoutsPerWeek),
            };
      const updated = await api.patch<Me>("/api/me/targets", body);
      await mutate(updated, false);
      toast({ tone: "success", text: source === "calculated" ? "Using estimated targets" : "Your targets are saved" });
    } catch (err) {
      toast({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof typeof vals, label: string, unit: string) => (
    <Field key={k} label={`${label} (${unit})`} htmlFor={k} optional>
      <Input id={k} inputMode="decimal" value={vals[k]} onChange={(ev) => setVals({ ...vals, [k]: ev.target.value })} />
    </Field>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Daily targets" back="/settings" />
      <Card className="space-y-2">
        <SectionTitle action={<InfoTip term="energyTarget" />}>
          <span className="inline-flex items-center gap-2">
            Energy estimate <EstimateBadge />
          </span>
        </SectionTitle>
        {e.ok ? (
          <div className="space-y-2 text-sm">
            <p>
              Estimated maintenance: <span className="font-semibold">{e.maintenance} kcal/day</span> (resting ≈ {e.bmr} kcal). Suggested target: <span className="font-semibold">{e.target} kcal</span>.
            </p>
            <p className="text-muted">{e.adjustmentNote}</p>
            <p className="text-xs text-muted">Method: {e.method}.</p>
          </div>
        ) : (
          <Alert tone="info">
            {e.reason} <Link href="/settings/profile">Update profile</Link>
          </Alert>
        )}
        <p className="text-xs text-muted">
          Currently using: <span className="font-medium">{t.targetsSource === "calculated" ? "estimated targets (update automatically when your profile changes)" : "your own targets"}</span>.
        </p>
        {t.targetsSource === "custom" && (
          <Button size="sm" variant="secondary" onClick={() => save("calculated")} loading={busy}>
            Switch back to estimated targets
          </Button>
        )}
      </Card>
      <Card className="space-y-4">
        <SectionTitle>Set your own</SectionTitle>
        <p className="text-sm text-muted">Leave a field empty to have no target for it. Targets are guides — there&apos;s no “failing”.</p>
        {me.profile.isMinor && <Alert tone="info">For people under 18 we recommend not restricting calories. You can leave the calorie target empty.</Alert>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {field("calorieTarget", "Calories", "kcal")}
          {field("proteinTargetG", "Protein", "g")}
          {field("carbTargetG", "Carbs", "g")}
          {field("fatTargetG", "Fat", "g")}
          {field("fiberTargetG", "Fibre", "g")}
          {field("waterTargetMl", "Water", "ml")}
          {field("stepTarget", "Steps", "steps")}
          {field("sleepTargetMin", "Sleep", "hours")}
          {field("workoutsPerWeek", "Workouts", "per week")}
        </div>
        <Button size="lg" className="w-full" onClick={() => save("custom")} loading={busy}>
          Save my targets
        </Button>
      </Card>
    </div>
  );
}
