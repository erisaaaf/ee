"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, errorMessage } from "@/lib/api";
import { MICRO_KEYS, NUTRIENT_META } from "@/lib/nutrition";
import type { Food } from "@/lib/client-types";
import { Alert, Button, Card, Field, Input, Segmented, Toggle, useFeedback } from "./ui";

const MAIN = ["kcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarG", "sodiumMg"] as const;

export function CustomFoodForm({ initial, barcode, name: initialName }: { initial?: Food; barcode?: string | null; name?: string | null }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [name, setName] = useState(initial?.name ?? initialName ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [code, setCode] = useState(initial?.barcode ?? barcode ?? "");
  const [servingLabel, setServingLabel] = useState(initial?.servingLabel ?? "1 serving");
  const [servingG, setServingG] = useState(String(initial?.servingG ?? 100));
  const [isLiquid, setLiquid] = useState(initial?.isLiquid ?? false);
  // Editing shows per-100 g values (that's how they're stored); new foods default to per-serving like labels.
  const [basis, setBasis] = useState<"perServing" | "per100">(initial ? "per100" : "perServing");
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries([...MAIN, ...MICRO_KEYS].map((k) => [k, initial?.per100[k] != null ? String(initial.per100[k]) : ""])),
  );
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  async function save() {
    setBusy(true);
    setErrors({});
    setFormError(null);
    const body = {
      name,
      brand: brand || null,
      barcode: code || null,
      servingG: Number(servingG),
      servingLabel,
      isLiquid,
      basis,
      ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, num(v)])),
    };
    try {
      const f = initial ? await api.put<Food>(`/api/foods/custom/${initial.id}`, body) : await api.post<Food>("/api/foods/custom", body);
      toast({ tone: "success", text: initial ? "Food updated" : "Food created — you can log it now" });
      router.push(`/nutrition/food/${f.id}`);
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details)) setErrors(Object.fromEntries((e.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!(await confirm({ title: "Delete this food?", body: "It will disappear from search. Past diary entries keep their values.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await api.del(`/api/foods/custom/${initial.id}`);
      toast({ tone: "success", text: "Food deleted" });
      router.push("/nutrition/foods");
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }

  const unit = isLiquid ? "ml" : "g";
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <Field label="Food name" htmlFor="fn" error={errors.name}>
          <Input id="fn" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand" htmlFor="fb" optional>
            <Input id="fb" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Barcode" htmlFor="fc" optional error={errors.barcode}>
            <Input id="fc" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} maxLength={14} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Serving name" htmlFor="fsl">
            <Input id="fsl" value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} placeholder="e.g. 1 bar" maxLength={60} />
          </Field>
          <Field label={`Serving size (${unit})`} htmlFor="fsg" error={errors.servingG}>
            <Input id="fsg" inputMode="decimal" value={servingG} onChange={(e) => setServingG(e.target.value)} />
          </Field>
        </div>
        <Toggle label="This is a drink (measured in ml)" checked={isLiquid} onChange={setLiquid} />
      </Card>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Nutrition</h2>
          <Segmented label="Values are" value={basis} onChange={setBasis} options={[{ value: "perServing", label: "Per serving" }, { value: "per100", label: `Per 100 ${unit}` }]} />
        </div>
        <p className="text-xs text-muted">Copy from the label. Leave a field empty if it isn&apos;t listed — empty means “unknown”, not zero.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MAIN.map((k) => (
            <Field key={k} label={`${NUTRIENT_META[k].label} (${NUTRIENT_META[k].unit})`} htmlFor={`v-${k}`} error={errors[k]}>
              <Input id={`v-${k}`} inputMode="decimal" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-primary">Vitamins & minerals (optional)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {MICRO_KEYS.map((k) => (
              <Field key={k} label={`${NUTRIENT_META[k].label} (${NUTRIENT_META[k].unit})`} htmlFor={`v-${k}`}>
                <Input id={`v-${k}`} inputMode="decimal" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </details>
      </Card>
      {formError && <Alert tone="danger">{formError}</Alert>}
      <div className="flex justify-between gap-2">
        {initial ? (
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={save} loading={busy} size="lg">
          {initial ? "Save changes" : "Create food"}
        </Button>
      </div>
    </div>
  );
}
