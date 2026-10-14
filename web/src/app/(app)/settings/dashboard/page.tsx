"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { DASHBOARD_WIDGETS, TRACKING_CATEGORIES } from "@/lib/validation";
import { useMe, type Me } from "@/components/me";
import { Button, Card, Chips, Field, PageHeader, SectionTitle, Select, Toggle, useFeedback } from "@/components/ui";

const WIDGET_LABELS: Record<string, string> = { calories: "Calories", protein: "Protein", water: "Water", steps: "Steps", workout: "Workout", sports: "Sports", sleep: "Sleep", mood: "Mood", goals: "Goals", insight: "AI insight" };

export default function DashboardSettings() {
  const { me, mutate } = useMe();
  const { toast } = useFeedback();
  const [widgets, setWidgets] = useState<string[]>(me.settings.dashboardWidgets);
  const [tracking, setTracking] = useState<string[]>(me.settings.trackingCategories);
  const [micros, setMicros] = useState(me.settings.showMicronutrients);
  const [theme, setTheme] = useState(me.settings.theme);
  const [motion, setMotion] = useState(me.settings.reducedMotion);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const updated = await api.patch<Me>("/api/me/settings", { dashboardWidgets: widgets, trackingCategories: tracking, showMicronutrients: micros, theme, reducedMotion: motion });
      await mutate(updated, false);
      toast({ tone: "success", text: "Saved" });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard & tracking" back="/settings" />
      <Card className="space-y-3">
        <SectionTitle>What I want to track</SectionTitle>
        <p className="text-sm text-muted">Turning a category off hides it everywhere. Your existing data is kept (delete it in Privacy if you want).</p>
        <Chips label="Tracking categories" options={TRACKING_CATEGORIES.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))} value={tracking} onChange={setTracking} />
      </Card>
      <Card className="space-y-3">
        <SectionTitle>Home screen widgets</SectionTitle>
        <Chips label="Widgets" options={DASHBOARD_WIDGETS.map((w) => ({ value: w, label: WIDGET_LABELS[w] }))} value={widgets} onChange={setWidgets} />
      </Card>
      <Card className="space-y-2">
        <SectionTitle>Display</SectionTitle>
        <Field label="Theme" htmlFor="th">
          <Select id="th" value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="system">Match my device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </Field>
        <Toggle label="Reduce motion" description="Turns off animations and transitions." checked={motion} onChange={setMotion} />
        <Toggle label="Show vitamins & minerals by default" description="Advanced nutrition details." checked={micros} onChange={setMicros} />
      </Card>
      <Button size="lg" className="w-full" onClick={save} loading={busy}>
        Save
      </Button>
    </div>
  );
}
