"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import type { Recipe, RecipeIdea } from "@/lib/client-types";
import { AiGate } from "@/components/ai-gate";
import { Alert, Badge, Button, Card, EstimateBadge, Field, PageHeader, Select, Spinner, TagInput, useFeedback } from "@/components/ui";

const ADJUST = [
  { value: "higher_protein", label: "Higher protein" },
  { value: "cheaper", label: "Cheaper" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "quicker", label: "Quicker" },
  { value: "fewer_ingredients", label: "Fewer ingredients" },
] as const;

export default function RecipeIdeasPage() {
  const router = useRouter();
  const { toast } = useFeedback();
  const [have, setHave] = useState<string[]>([]);
  const [mealType, setMealType] = useState("any");
  const [servings, setServings] = useState("2");
  const [maxMin, setMaxMin] = useState("");
  const [ideas, setIdeas] = useState<RecipeIdea[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(adjust: string[] = [], base?: RecipeIdea, key = "all") {
    if (!have.length) return toast({ tone: "error", text: "Add at least one ingredient you have." });
    setBusy(key);
    try {
      const r = await api.post<RecipeIdea[]>("/api/ai/recipes", {
        ingredients: have,
        mealType,
        servings: Number(servings),
        maxMinutes: maxMin ? Number(maxMin) : undefined,
        adjust,
        baseRecipe: base ? JSON.stringify({ name: base.name, ingredients: base.ingredients, instructions: base.instructions }) : undefined,
      });
      setIdeas((cur) => (base && cur ? cur.map((x) => (x === base ? r[0] ?? x : x)) : r));
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function save(idea: RecipeIdea) {
    setBusy(`save-${idea.name}`);
    try {
      const r = await api.post<Recipe>("/api/recipes", {
        name: idea.name,
        description: idea.description,
        servings: idea.servings,
        instructions: idea.instructions,
        prepMinutes: idea.prepMinutes,
        ingredients: idea.ingredients.map((i) => ({ foodId: i.foodId, name: i.name, grams: i.grams, quantity: 1, unitLabel: "g" })),
      });
      toast({ tone: "success", text: "Saved to your recipes" });
      router.push(`/nutrition/recipes/${r.id}`);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="What can I cook?" subtitle="Recipes from what you have at home" back="/nutrition/recipes" />
      <AiGate feature="Recipe ideas">
        <Card className="space-y-4">
          <Field label="Ingredients at home">
            <TagInput label="Ingredients" value={have} onChange={setHave} placeholder="e.g. chicken, rice, tomatoes, yogurt" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Meal" htmlFor="im">
              <Select id="im" value={mealType} onChange={(e) => setMealType(e.target.value)}>
                {["any", "breakfast", "lunch", "dinner", "snack"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Servings" htmlFor="is">
              <Select id="is" value={servings} onChange={(e) => setServings(e.target.value)}>
                {[1, 2, 3, 4, 6].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Max time" htmlFor="it">
              <Select id="it" value={maxMin} onChange={(e) => setMaxMin(e.target.value)}>
                <option value="">Any</option>
                {[10, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button className="w-full" onClick={() => run()} loading={busy === "all"}>
            Suggest recipes
          </Button>
        </Card>
        {busy === "all" && <Spinner label="Cooking up ideas…" />}
        {ideas?.map((idea, i) => (
          <Card key={`${idea.name}-${i}`} className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{idea.name}</h2>
                <p className="text-sm text-muted">{idea.description}</p>
              </div>
              <Badge tone="primary">AI</Badge>
            </div>
            <p className="text-xs text-muted">
              {idea.prepMinutes} min · {idea.servings} servings
              {idea.extraIngredientsNeeded.length > 0 && ` · also needs: ${idea.extraIngredientsNeeded.join(", ")}`}
            </p>
            {idea.nutritionPerServing && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="tabular font-medium">
                  {Math.round(idea.nutritionPerServing.kcal ?? 0)} kcal · P {Math.round(idea.nutritionPerServing.proteinG ?? 0)} g per serving
                </span>
                {idea.nutritionStatus === "calculated" ? <Badge tone="success">Calculated</Badge> : <EstimateBadge label={idea.nutritionStatus === "partial" ? "Partly calculated" : "AI estimate"} />}
              </p>
            )}
            {idea.allergenWarnings.length > 0 && <Alert tone="danger">Allergy check: {idea.allergenWarnings.join("; ")}</Alert>}
            <details>
              <summary className="cursor-pointer text-sm font-medium text-primary">Ingredients & steps</summary>
              <ul className="mt-2 text-sm">
                {idea.ingredients.map((g, j) => (
                  <li key={j}>
                    {g.name} — {Math.round(g.grams)} g
                  </li>
                ))}
              </ul>
              <p className="mt-2 whitespace-pre-line text-sm">{idea.instructions}</p>
            </details>
            <div className="flex flex-wrap gap-2">
              {ADJUST.map((a) => (
                <Button key={a.value} size="sm" variant="ghost" onClick={() => run([a.value], idea, `${i}-${a.value}`)} loading={busy === `${i}-${a.value}`}>
                  {a.label}
                </Button>
              ))}
            </div>
            <Button className="w-full" variant="soft" onClick={() => save(idea)} loading={busy === `save-${idea.name}`}>
              Save as recipe
            </Button>
          </Card>
        ))}
        {ideas && ideas.length === 0 && <Alert tone="info">No ideas this time — try adding a few more ingredients.</Alert>}
      </AiGate>
    </div>
  );
}
