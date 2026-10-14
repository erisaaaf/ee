"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, RefreshCw, ShoppingCart, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { addDays, localToday } from "@/lib/dates";
import type { MealPlan, Recipe } from "@/lib/client-types";
import { Alert, Badge, Button, Card, ErrorState, EstimateBadge, Field, Input, LoadingCards, PageHeader, Select, Sheet, useFeedback } from "@/components/ui";

type Item = MealPlan["items"][number];
type Ingredient = { name: string; grams: number; foodId: string | null; matchedName?: string | null };
type Nutr = { kcal?: number | null; proteinG?: number | null; carbsG?: number | null; fatG?: number | null };

function StatusBadge({ status }: { status: string }) {
  if (status === "calculated") return <Badge tone="success">Calculated from food data</Badge>;
  if (status === "partial") return <EstimateBadge label="Partly calculated" title="Some ingredients weren't found in the food database" />;
  if (status === "ai_estimate") return <EstimateBadge label="AI estimate" />;
  return <Badge>No nutrition data</Badge>;
}

function MealCard({ planId, item, onChange }: { planId: string; item: Item; onChange: () => void }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const ings = item.ingredients as Ingredient[];
  const n = (item.nutrition ?? {}) as Nutr;
  const warnings = item.allergenWarnings as string[];

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      onChange();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }
  const saveAsRecipe = () =>
    run("recipe", async () => {
      const r = await api.post<Recipe>("/api/recipes", {
        name: item.title,
        description: item.description?.split("\n")[0] ?? null,
        servings: item.servings,
        instructions: item.instructions,
        prepMinutes: item.prepMinutes,
        ingredients: ings.map((i) => ({ foodId: i.foodId, name: i.name, grams: i.grams, quantity: 1, unitLabel: "g" })),
      });
      toast({ tone: "success", text: "Saved to your recipes" });
      router.push(`/nutrition/recipes/${r.id}`);
    });
  const logServing = () =>
    run("log", async () => {
      const totalG = ings.reduce((s, i) => s + i.grams, 0);
      const perServingG = Math.max(1, Math.round(totalG / item.servings));
      const f = (v: number | null | undefined) => (v == null ? null : Math.round(((v * 100) / perServingG) * 100) / 100);
      await api.post("/api/diary", { kind: "estimate", source: "ai", name: item.title, per100: { kcal: f(n.kcal), proteinG: f(n.proteinG), carbsG: f(n.carbsG), fatG: f(n.fatG) }, grams: perServingG, quantity: 1, unitLabel: "1 serving", date: localToday(), mealType: item.mealType });
      globalMutate((k) => typeof k === "string" && k.startsWith("/api/dashboard"));
      toast({ tone: "success", text: "Logged one serving to today (as an estimate)" });
    });

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{item.mealType}</p>
          <h3 className="font-semibold">{item.title}</h3>
          <p className="text-xs text-muted">
            {item.prepMinutes ? `${item.prepMinutes} min · ` : ""}
            {item.servings} serving{item.servings === 1 ? "" : "s"}
          </p>
        </div>
        {n.kcal != null && (
          <div className="text-right">
            <p className="tabular font-semibold">{Math.round(n.kcal)} kcal</p>
            <p className="tabular text-xs text-muted">P {Math.round(n.proteinG ?? 0)} g / serving</p>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <StatusBadge status={item.nutritionStatus} />
      </div>
      {warnings.length > 0 && (
        <div className="mt-2">
          <Alert tone="danger" title="Check before eating">
            <ul className="list-disc pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Details
        </Button>
        <Button size="sm" variant="soft" onClick={() => run("replace", () => api.post(`/api/meal-plans/${planId}/items/${item.id}`, {}))} loading={busy === "replace"} icon={<RefreshCw className="size-4" />}>
          Replace
        </Button>
        <Button size="sm" variant="ghost" onClick={logServing} loading={busy === "log"}>
          Log 1 serving
        </Button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={item.title} wide>
        <div className="space-y-4 text-sm">
          {item.description && <p className="whitespace-pre-line text-muted">{item.description}</p>}
          <div>
            <h4 className="mb-1 font-semibold">Ingredients (whole recipe)</h4>
            <ul className="divide-y divide-border">
              {ings.map((i, idx) => (
                <li key={idx} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {i.name}
                    {i.matchedName && <span className="block text-xs text-muted">matched: {i.matchedName}</span>}
                  </span>
                  <span className="text-muted">{Math.round(i.grams)} g</span>
                </li>
              ))}
            </ul>
          </div>
          {item.instructions && (
            <div>
              <h4 className="mb-1 font-semibold">Steps</h4>
              <p className="whitespace-pre-line">{item.instructions}</p>
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="w-28">
              <Field label="Servings" htmlFor={`sv-${item.id}`}>
                <Select id={`sv-${item.id}`} value={item.servings} onChange={(e) => run("servings", () => api.patch(`/api/meal-plans/${planId}/items/${item.id}`, { servings: Number(e.target.value) }))}>
                  {[1, 2, 3, 4, 5, 6, 8].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="pb-3 text-xs text-muted">Changes ingredient amounts; nutrition per serving stays the same.</p>
          </div>
          <div className="space-y-2 rounded-xl border border-border p-3">
            <Field label="Replace with something different" htmlFor={`ri-${item.id}`} optional>
              <Input id={`ri-${item.id}`} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. vegetarian, quicker, no oven" />
            </Field>
            <Button size="sm" onClick={() => run("replace", () => api.post(`/api/meal-plans/${planId}/items/${item.id}`, { instruction }).then(() => setOpen(false)))} loading={busy === "replace"}>
              Replace this meal
            </Button>
          </div>
          <Button variant="secondary" onClick={saveAsRecipe} loading={busy === "recipe"} icon={<ChefHat className="size-4" />}>
            Save as recipe
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}

export default function MealPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const { data: plan, error, isLoading, mutate } = useSWR<MealPlan>(`/api/meal-plans/${id}`);
  const [busy, setBusy] = useState(false);
  if (isLoading) return <LoadingCards />;
  if (error || !plan) return <ErrorState error={error} onRetry={() => mutate()} />;
  const tips = ((plan.request as { tips?: string[] }).tips ?? []) as string[];

  async function grocery() {
    setBusy(true);
    try {
      const l = await api.post<{ id: string }>(`/api/meal-plans/${id}/grocery`);
      router.push(`/nutrition/grocery/${l.id}`);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={plan.title}
        subtitle={`${plan.days} day${plan.days === 1 ? "" : "s"} · AI-generated suggestions`}
        back="/nutrition/plans"
        actions={
          <Button size="sm" onClick={grocery} loading={busy} icon={<ShoppingCart className="size-4" />}>
            Grocery list
          </Button>
        }
      />
      {tips.length > 0 && (
        <Alert tone="info" title="Tips">
          <ul className="list-disc pl-4">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Alert>
      )}
      {Array.from({ length: plan.days }, (_, d) => (
        <section key={d} aria-labelledby={`day-${d}`} className="space-y-3">
          <h2 id={`day-${d}`} className="text-lg font-semibold">
            Day {d + 1} <span className="text-sm font-normal text-muted">· {new Date(`${addDays(plan.startDate, d)}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" })}</span>
          </h2>
          {plan.items
            .filter((i) => i.dayIndex === d)
            .map((i) => (
              <MealCard key={i.id} planId={id} item={i} onChange={() => mutate()} />
            ))}
        </section>
      ))}
      <Button
        variant="ghost"
        className="text-danger"
        icon={<Trash2 className="size-4" />}
        onClick={async () => {
          if (await confirm({ title: "Delete this meal plan?", confirmLabel: "Delete", danger: true })) {
            try {
              await api.del(`/api/meal-plans/${id}`);
              router.push("/nutrition/plans");
            } catch (e) {
              toast({ tone: "error", text: errorMessage(e) });
            }
          }
        }}
      >
        Delete plan
      </Button>
    </div>
  );
}
