"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ImagePlus, Link2, Plus, Search, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { recipeNutrition, type Per100 } from "@/lib/nutrition";
import type { Food, Recipe } from "@/lib/client-types";
import { Alert, Badge, Button, Card, EstimateBadge, Field, Input, Select, Sheet, Textarea, useFeedback } from "./ui";

type Ing = { key: string; foodId: string | null; name: string; grams: string; per100: Per100 | null };

function IngredientPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (f: Food) => void }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading } = useSWR<Food[]>(open && dq.length >= 2 ? `/api/foods?q=${encodeURIComponent(dq)}` : null);
  return (
    <Sheet open={open} onClose={onClose} title="Link an ingredient">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search foods" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. chicken breast raw" autoFocus />
        </div>
        {isLoading && <p className="text-sm text-muted">Searching…</p>}
        <ul className="divide-y divide-border">
          {data?.map((f) => (
            <li key={f.id}>
              <button
                className="flex w-full items-center justify-between gap-2 py-2.5 text-left hover:bg-surface-2"
                onClick={() => {
                  onPick(f);
                  onClose();
                  setQ("");
                }}
              >
                <span className="text-sm">{f.name}</span>
                <span className="text-xs text-muted">{f.per100.kcal != null ? `${Math.round(f.per100.kcal)} kcal/100 g` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
        {data && data.length === 0 && <p className="text-sm text-muted">No matches. You can still keep the ingredient unlinked — it just won&apos;t count toward nutrition.</p>}
      </div>
    </Sheet>
  );
}

async function resizePhoto(file: File) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.75);
}

export function RecipeForm({ initial }: { initial?: Recipe }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [servings, setServings] = useState(String(initial?.servings ?? 2));
  const [method, setMethod] = useState(initial?.cookingMethod ?? "");
  const [prep, setPrep] = useState(initial?.prepMinutes?.toString() ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [photo, setPhoto] = useState<string | null>(initial?.photo ?? null);
  const [ings, setIngs] = useState<Ing[]>(
    initial?.ingredients.map((i) => ({ key: i.id, foodId: i.foodId, name: i.name, grams: String(i.grams), per100: (i.per100 as Per100 | null) ?? null })) ?? [{ key: "n0", foodId: null, name: "", grams: "", per100: null }],
  );
  const [picking, setPicking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const nutrition = useMemo(
    () => recipeNutrition(ings.filter((i) => i.name.trim() && Number(i.grams) > 0).map((i) => ({ grams: Number(i.grams), per100: i.per100 })), Number(servings) || 1),
    [ings, servings],
  );
  const update = (key: string, patch: Partial<Ing>) => setIngs((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      name,
      description: description || null,
      servings: Number(servings),
      cookingMethod: method || null,
      prepMinutes: prep ? Number(prep) : null,
      instructions: instructions || null,
      photo,
      ingredients: ings.filter((i) => i.name.trim()).map((i) => ({ foodId: i.foodId, name: i.name.trim(), grams: Number(i.grams) || 0, quantity: 1, unitLabel: "g" })),
    };
    try {
      const r = initial ? await api.put<Recipe>(`/api/recipes/${initial.id}`, body) : await api.post<Recipe>("/api/recipes", body);
      toast({ tone: "success", text: initial ? "Recipe updated" : "Recipe saved" });
      router.push(`/nutrition/recipes/${r.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <Field label="Recipe name" htmlFor="rn">
          <Input id="rn" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Homemade chicken pasta" maxLength={120} />
        </Field>
        <Field label="Short description" htmlFor="rd" optional>
          <Input id="rd" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Servings" htmlFor="rs">
            <Input id="rs" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
          </Field>
          <Field label="Prep (min)" htmlFor="rp" optional>
            <Input id="rp" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Method" htmlFor="rm" optional>
            <Select id="rm" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">—</option>
              {["Boiled", "Baked", "Grilled", "Pan-fried", "Stewed", "Steamed", "Raw / no-cook", "Slow-cooked"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Recipe photo" onChange={async (e) => e.target.files?.[0] && setPhoto(await resizePhoto(e.target.files[0]))} />
          {photo ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Recipe" className="size-20 rounded-xl object-cover" />
              <Button size="sm" variant="ghost" onClick={() => setPhoto(null)}>
                Remove photo
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} icon={<ImagePlus className="size-4" />}>
              Add photo (optional)
            </Button>
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Ingredients</h2>
        <p className="text-xs text-muted">Enter the total amount used in the whole recipe. Link each ingredient to a food so nutrition can be calculated.</p>
        {ings.map((i) => (
          <div key={i.key} className="rounded-xl border border-border p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field label="Ingredient" htmlFor={`in-${i.key}`}>
                  <Input id={`in-${i.key}`} value={i.name} onChange={(e) => update(i.key, { name: e.target.value })} placeholder="e.g. Chicken" />
                </Field>
              </div>
              <div className="w-24">
                <Field label="Grams" htmlFor={`ig-${i.key}`}>
                  <Input id={`ig-${i.key}`} inputMode="decimal" value={i.grams} onChange={(e) => update(i.key, { grams: e.target.value })} />
                </Field>
              </div>
              <button onClick={() => setIngs((xs) => xs.filter((x) => x.key !== i.key))} aria-label={`Remove ${i.name || "ingredient"}`} className="inline-flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {i.per100 ? <Badge tone="success">Linked · {i.per100.kcal != null ? `${Math.round(i.per100.kcal)} kcal/100 g` : "no kcal data"}</Badge> : <Badge tone="warning">Not linked — no nutrition</Badge>}
              <Button size="sm" variant="ghost" onClick={() => setPicking(i.key)} icon={<Link2 className="size-4" />}>
                {i.per100 ? "Change" : "Link to food"}
              </Button>
            </div>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setIngs((xs) => [...xs, { key: `n${Date.now()}`, foodId: null, name: "", grams: "", per100: null }])} icon={<Plus className="size-4" />}>
          Add ingredient
        </Button>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Nutrition</h2>
          {!nutrition.complete && <EstimateBadge label="Incomplete" title="Some ingredients aren't linked to nutrition data" />}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted">Whole recipe</p>
            <p className="tabular font-semibold">{nutrition.total.values.kcal} kcal</p>
            <p className="tabular text-xs text-muted">
              P {Math.round(nutrition.total.values.proteinG)} g · C {Math.round(nutrition.total.values.carbsG)} g · F {Math.round(nutrition.total.values.fatG)} g
            </p>
          </div>
          <div>
            <p className="text-muted">Per serving ({nutrition.gramsPerServing} g)</p>
            <p className="tabular font-semibold">{nutrition.perServing.kcal} kcal</p>
            <p className="tabular text-xs text-muted">
              P {nutrition.perServing.proteinG} g · C {nutrition.perServing.carbsG} g · F {nutrition.perServing.fatG} g
            </p>
          </div>
        </div>
        {nutrition.unlinkedIngredients > 0 && <p className="mt-2 text-xs text-warning">{nutrition.unlinkedIngredients} ingredient(s) aren&apos;t linked, so totals are lower than reality.</p>}
        <p className="mt-2 text-xs text-muted">Calculated from raw ingredient weights. Cooking changes weight (water, oil absorption), so per-serving values are estimates.</p>
      </Card>

      <Card>
        <Field label="Instructions" htmlFor="ri" optional>
          <Textarea id="ri" rows={6} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={"1. Boil the pasta…\n2. Grill the chicken…"} />
        </Field>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}
      <Button size="lg" className="w-full" onClick={save} loading={busy}>
        {initial ? "Save changes" : "Save recipe"}
      </Button>

      <IngredientPicker
        open={!!picking}
        onClose={() => setPicking(null)}
        onPick={(f) => {
          const cur = ings.find((x) => x.key === picking);
          update(picking!, { foodId: f.id, per100: f.per100, name: cur?.name.trim() ? cur.name : f.name });
        }}
      />
    </div>
  );
}
