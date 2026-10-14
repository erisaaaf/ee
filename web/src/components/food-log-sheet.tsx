"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { mutate as globalMutate } from "swr";
import { Heart } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { postOrQueue } from "./offline";
import { MACRO_KEYS, MEAL_TYPES, NUTRIENT_META, scaleNutrients, type MealType } from "@/lib/nutrition";
import { foodName } from "@/lib/i18n";
import type { Food } from "@/lib/client-types";
import { useMe } from "./me";
import { Alert, Button, DataQualityBadge, Field, Input, Select, Sheet, useFeedback } from "./ui";

export function defaultMeal(): MealType {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack";
}

export function NutritionPreview({ per100, grams }: { per100: Food["per100"]; grams: number }) {
  const n = scaleNutrients(per100, grams, MACRO_KEYS);
  return (
    <dl className="grid grid-cols-4 gap-2 text-center">
      {(["kcal", "proteinG", "carbsG", "fatG"] as const).map((k) => (
        <div key={k} className="rounded-xl bg-surface-2 p-2">
          <dt className="text-[11px] text-muted">{NUTRIENT_META[k].short ?? NUTRIENT_META[k].label}</dt>
          <dd className="tabular text-sm font-semibold">{n[k] == null ? "?" : `${Math.round(n[k]!)}${k === "kcal" ? "" : " g"}`}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FoodLogSheet({ food, open, onClose, date, meal, source = "search", onLogged }: { food: Food | null; open: boolean; onClose: () => void; date: string; meal?: MealType; source?: "search" | "barcode" | "saved"; onLogged?: () => void }) {
  const { lang } = useMe();
  const { toast } = useFeedback();
  const [servingIdx, setServingIdx] = useState(0);
  const [qty, setQty] = useState("1");
  const [mealType, setMealType] = useState<MealType>(meal ?? defaultMeal());
  const [saving, setSaving] = useState(false);
  const [fav, setFav] = useState(false);

  // Reset the form when a different food is opened (adjusting state on prop change, without an effect).
  const [shownFood, setShownFood] = useState<Food | null>(null);
  if (food && food !== shownFood) {
    setShownFood(food);
    setServingIdx(0);
    setQty("1");
    setFav(!!food.isFavorite);
    setMealType(meal ?? defaultMeal());
  }

  const servings = useMemo(() => (food ? [...food.servings, { label: `grams (${food.isLiquid ? "ml" : "g"})`, grams: 1 }] : []), [food]);
  if (!food) return null;
  const serving = servings[servingIdx] ?? servings[0];
  const q = Number(qty.replace(",", "."));
  const grams = Number.isFinite(q) && q > 0 ? Math.round(serving.grams * q * 10) / 10 : 0;
  const isGrams = serving.grams === 1;

  async function save() {
    if (!food || grams <= 0) return;
    setSaving(true);
    try {
      const r = await postOrQueue("/api/diary", { kind: "food", foodId: food.id, grams, quantity: q, unitLabel: isGrams ? (food.isLiquid ? "ml" : "g") : serving.label, date, mealType, source }, food.name);
      toast({ tone: r.queued ? "info" : "success", text: r.queued ? "Saved offline — it will sync when you reconnect." : `Added ${foodName(food, lang)} to ${mealType}` });
      globalMutate((k) => typeof k === "string" && (k.startsWith("/api/diary") || k.startsWith("/api/dashboard") || k.startsWith("/api/foods/recent")));
      onLogged?.();
      onClose();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  async function toggleFav() {
    try {
      const r = await api.post<{ favorite: boolean }>("/api/favorites", { kind: "food", refId: food!.id });
      setFav(r.favorite);
      globalMutate("/api/foods/favorites");
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={foodName(food, lang)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={grams <= 0}>
            Add to diary
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {food.brand && <span className="text-sm text-muted">{food.brand}</span>}
          <DataQualityBadge quality={food.dataQuality} />
          <button onClick={toggleFav} aria-pressed={fav} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted hover:bg-surface-2">
            <Heart className={fav ? "size-4 fill-fat text-fat" : "size-4"} aria-hidden /> {fav ? "Favourite" : "Save as favourite"}
          </button>
        </div>
        {food.dataQuality === "estimate" && <Alert tone="warning">This is a typical recipe estimate. Home-made and restaurant versions vary a lot.</Alert>}
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Serving" htmlFor="serving">
            <Select id="serving" value={servingIdx} onChange={(e) => setServingIdx(Number(e.target.value))}>
              {servings.map((s, i) => (
                <option key={i} value={i}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={isGrams ? (food.isLiquid ? "ml" : "Grams") : "Amount"} htmlFor="qty">
            <Input id="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>
        <Field label="Meal" htmlFor="meal">
          <Select id="meal" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
            {MEAL_TYPES.map((m) => (
              <option key={m} value={m}>
                {m[0].toUpperCase() + m.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-2 text-sm text-muted">
            {grams > 0 ? `${grams} ${food.isLiquid ? "ml" : "g"}` : "Enter an amount"}
          </p>
          <NutritionPreview per100={food.per100} grams={grams} />
        </div>
        <Link href={`/nutrition/food/${food.id}`} className="inline-block text-sm text-primary hover:underline">
          Full nutrition details & alternatives
        </Link>
      </div>
    </Sheet>
  );
}
