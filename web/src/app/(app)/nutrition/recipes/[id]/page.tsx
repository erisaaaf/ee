"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Heart, Pencil, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { localToday } from "@/lib/dates";
import { MEAL_TYPES, type MealType } from "@/lib/nutrition";
import type { Recipe } from "@/lib/client-types";
import { defaultMeal } from "@/components/food-log-sheet";
import { Badge, Button, Card, ErrorState, EstimateBadge, Field, Input, LinkButton, LoadingCards, PageHeader, SectionTitle, Select, useFeedback } from "@/components/ui";

export default function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const { data: r, error, isLoading, mutate } = useSWR<Recipe>(`/api/recipes/${id}`);
  const [servings, setServings] = useState("1");
  const [meal, setMeal] = useState<MealType>(defaultMeal());
  const [busy, setBusy] = useState(false);
  if (isLoading) return <LoadingCards />;
  if (error || !r) return <ErrorState error={error} onRetry={() => mutate()} />;

  async function log() {
    setBusy(true);
    try {
      await api.post("/api/diary", { kind: "recipe", recipeId: id, servings: Number(servings), date: localToday(), mealType: meal });
      globalMutate((k) => typeof k === "string" && (k.startsWith("/api/diary") || k.startsWith("/api/dashboard")));
      toast({ tone: "success", text: `Logged ${servings} serving(s) to ${meal}` });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast({ tone: "success", text: ok });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }
  const n = r.nutrition;
  return (
    <div className="space-y-4">
      <PageHeader
        title={r.name}
        subtitle={r.description ?? undefined}
        back="/nutrition/recipes"
        actions={
          <>
            <Button size="sm" variant="ghost" aria-pressed={r.isFavorite} onClick={() => act(async () => { await api.post("/api/favorites", { kind: "recipe", refId: id }); await mutate(); }, r.isFavorite ? "Removed from favourites" : "Added to favourites")} icon={<Heart className={r.isFavorite ? "size-4 fill-fat text-fat" : "size-4"} />}>
              <span className="sr-only">Favourite</span>
            </Button>
            <LinkButton href={`/nutrition/recipes/${id}/edit`} size="sm" icon={<Pencil className="size-4" />}>
              Edit
            </LinkButton>
          </>
        }
      />
      {r.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.photo} alt={r.name} className="max-h-64 w-full rounded-2xl object-cover" />
      )}
      <Card>
        <SectionTitle action={!n.complete ? <EstimateBadge label="Incomplete" /> : r.source === "ai" ? <Badge tone="primary">AI recipe</Badge> : undefined}>Per serving</SectionTitle>
        <div className="grid grid-cols-4 gap-2 text-center">
          {(
            [
              ["kcal", "kcal", n.perServing.kcal],
              ["Protein", "g", n.perServing.proteinG],
              ["Carbs", "g", n.perServing.carbsG],
              ["Fat", "g", n.perServing.fatG],
            ] as const
          ).map(([l, u, v]) => (
            <div key={l} className="rounded-xl bg-surface-2 p-2">
              <p className="text-[11px] text-muted">{l}</p>
              <p className="tabular font-semibold">
                {Math.round(v)}
                {u === "g" ? " g" : ""}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {r.servings} servings · {n.gramsPerServing} g each · whole recipe {n.total.values.kcal} kcal{r.prepMinutes ? ` · ${r.prepMinutes} min` : ""}
          {r.cookingMethod ? ` · ${r.cookingMethod}` : ""}
        </p>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Log this recipe</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Servings" htmlFor="sv">
            <Input id="sv" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
          </Field>
          <Field label="Meal" htmlFor="ml">
            <Select id="ml" value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
              {MEAL_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button className="w-full" onClick={log} loading={busy} disabled={!(Number(servings) > 0)}>
          Add to today
        </Button>
      </Card>

      <Card>
        <SectionTitle>Ingredients</SectionTitle>
        <ul className="divide-y divide-border text-sm">
          {r.ingredients.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2">
              <span>{i.name}</span>
              <span className="flex items-center gap-2 text-muted">
                {Math.round(i.grams)} g {!i.hasNutrition && <Badge tone="warning">no data</Badge>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {r.instructions && (
        <Card>
          <SectionTitle>Instructions</SectionTitle>
          <p className="whitespace-pre-line text-sm leading-relaxed">{r.instructions}</p>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => act(async () => { const c = await api.post<Recipe>(`/api/recipes/${id}/duplicate`); router.push(`/nutrition/recipes/${c.id}`); }, "Recipe duplicated")}>
          Duplicate
        </Button>
        <Button
          variant="ghost"
          className="text-danger"
          icon={<Trash2 className="size-4" />}
          onClick={async () => {
            if (await confirm({ title: "Delete recipe?", body: "Past diary entries keep their nutrition values.", confirmLabel: "Delete", danger: true })) {
              await act(() => api.del(`/api/recipes/${id}`), "Recipe deleted");
              router.push("/nutrition/recipes");
            }
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
