"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { addDays, localToday } from "@/lib/dates";
import { DIET_PATTERNS } from "@/lib/validation";
import type { MealPlan } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { AiGate } from "@/components/ai-gate";
import { Alert, Button, Card, Chips, EmptyState, Field, Input, PageHeader, SectionTitle, Select, Spinner, TagInput, useFeedback } from "@/components/ui";

type PlanListItem = { id: string; title: string; startDate: string; days: number; createdAt: string };

export default function MealPlansPage() {
  const { me } = useMe();
  const router = useRouter();
  const { toast } = useFeedback();
  const { data: plans } = useSWR<PlanListItem[]>("/api/meal-plans");
  const [days, setDays] = useState("3");
  const [mealTypes, setMealTypes] = useState<string[]>(["breakfast", "lunch", "dinner"]);
  const [diet, setDiet] = useState(me.preferences.dietPattern);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [extraAllergies, setExtraAllergies] = useState<string[]>([]);
  const [have, setHave] = useState<string[]>([]);
  const [budget, setBudget] = useState(me.preferences.budget ?? "");
  const [maxMin, setMaxMin] = useState(me.preferences.cookingTimeMin?.toString() ?? "");
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const p = await api.post<MealPlan>("/api/meal-plans", {
        days: Number(days),
        startDate: addDays(localToday(), 0),
        mealTypes,
        diet,
        avoid,
        extraAllergies,
        availableIngredients: have,
        budget: budget || undefined,
        maxCookingMinutes: maxMin ? Number(maxMin) : undefined,
        cuisines,
        notes: notes || undefined,
      });
      router.push(`/nutrition/plans/${p.id}`);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Meal plans" subtitle="AI-generated, based on your preferences" back="/nutrition" />
      {plans && plans.length > 0 && (
        <Card>
          <SectionTitle>Your plans</SectionTitle>
          <ul className="divide-y divide-border">
            {plans.map((p) => (
              <li key={p.id}>
                <Link href={`/nutrition/plans/${p.id}`} className="flex items-center justify-between py-3 hover:underline">
                  <span className="text-sm font-medium">{p.title}</span>
                  <span className="text-xs text-muted">
                    {p.days} day{p.days === 1 ? "" : "s"} from {p.startDate}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <AiGate feature="Meal planning">
        <Card className="space-y-4">
          <SectionTitle>Create a new plan</SectionTitle>
          {me.preferences.allergies.length > 0 && <Alert tone="info">Your recorded allergies ({me.preferences.allergies.join(", ")}) are always excluded and double-checked.</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Days" htmlFor="pd">
              <Select id="pd" value={days} onChange={(e) => setDays(e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </Select>
            </Field>
            <Field label="Eating pattern" htmlFor="pdiet">
              <Select id="pdiet" value={diet} onChange={(e) => setDiet(e.target.value)}>
                {DIET_PATTERNS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Meals each day">
            <Chips label="Meals" options={["breakfast", "lunch", "dinner", "snack"].map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))} value={mealTypes} onChange={(v) => v.length && setMealTypes(v)} />
          </Field>
          <Field label="Ingredients I already have" optional hint="We'll use these first.">
            <TagInput label="Ingredients I have" value={have} onChange={setHave} placeholder="e.g. rice, eggs, spinach" />
          </Field>
          <Field label="Avoid" optional>
            <TagInput label="Foods to avoid" value={avoid} onChange={setAvoid} placeholder="e.g. mushrooms" />
          </Field>
          <Field label="Extra allergies for this plan" optional>
            <TagInput label="Extra allergies" value={extraAllergies} onChange={setExtraAllergies} placeholder="e.g. sesame" />
          </Field>
          <Field label="Cuisines" optional>
            <TagInput label="Cuisines" value={cuisines} onChange={setCuisines} placeholder="e.g. Albanian, Mediterranean" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget" htmlFor="pb" optional>
              <Select id="pb" value={budget} onChange={(e) => setBudget(e.target.value)}>
                <option value="">Any</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="flexible">Flexible</option>
              </Select>
            </Field>
            <Field label="Max cooking time" htmlFor="pm" optional>
              <Select id="pm" value={maxMin} onChange={(e) => setMaxMin(e.target.value)}>
                <option value="">Any</option>
                {[15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Anything else?" htmlFor="pn" optional>
            <Input id="pn" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. quick breakfasts, I train in the evening" />
          </Field>
          <Button size="lg" className="w-full" onClick={generate} loading={busy}>
            Generate plan
          </Button>
          {busy && <Spinner label="Planning your meals — this can take up to a minute…" />}
          <p className="text-xs text-muted">Plans are suggestions, not medical or dietetic advice. Nutrition is calculated from our food database where ingredients match, otherwise shown as an AI estimate.</p>
        </Card>
      </AiGate>
      {plans && plans.length === 0 && <EmptyState icon={<CalendarDays className="size-8" />} title="No meal plans yet">Generate one above — you can swap individual meals afterwards.</EmptyState>}
    </div>
  );
}
