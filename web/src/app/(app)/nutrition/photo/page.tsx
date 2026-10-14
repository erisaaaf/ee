"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, ImagePlus, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { localToday } from "@/lib/dates";
import { MEAL_TYPES, type MealType } from "@/lib/nutrition";
import type { AiStatus, PhotoAnalysis } from "@/lib/client-types";
import { defaultMeal, NutritionPreview } from "@/components/food-log-sheet";
import { Alert, Badge, Button, Card, EstimateBadge, Field, Input, PageHeader, Select, Spinner, useFeedback } from "@/components/ui";

type Per100 = { kcal?: number | null; proteinG?: number | null; carbsG?: number | null; fatG?: number | null; fiberG?: number | null };
type Row = { key: string; name: string; grams: string; source: "database" | "ai"; dbPer100: Per100 | null; dbName: string | null; aiPer100: Per100 | null; portionConfidence: string; identificationConfidence: string; ingredients: string[] };

/** Downscale to ≤1280 px JPEG. Re-encoding via canvas also drops EXIF metadata (e.g. GPS location). */
async function prepareImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function PhotoAnalyzer() {
  const date = useSearchParams().get("date") ?? localToday();
  const router = useRouter();
  const { toast } = useFeedback();
  const { data: status } = useSWR<AiStatus>("/api/ai/status");
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PhotoAnalysis | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [meal, setMeal] = useState<MealType>(defaultMeal());
  const [saving, setSaving] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast({ tone: "error", text: "Please choose an image file." });
    try {
      setPreview(await prepareImage(f));
      setResult(null);
      setRows([]);
    } catch {
      toast({ tone: "error", text: "We couldn't read that image. Try another photo." });
    }
  }

  async function analyze() {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await api.post<PhotoAnalysis>("/api/ai/photo", { image: preview, hint: hint || undefined });
      setResult(r);
      if ("items" in r && r.items.length) {
        setRows(
          r.items.map((it, i) => ({
            key: `${i}-${it.name}`,
            name: it.name,
            grams: String(it.grams),
            source: it.databaseMatch ? "database" : "ai",
            dbPer100: it.databaseMatch?.per100 ?? null,
            dbName: it.databaseMatch?.name ?? null,
            aiPer100: it.aiPer100,
            portionConfidence: it.portionConfidence,
            identificationConfidence: it.identificationConfidence,
            ingredients: it.likelyIngredients,
          })),
        );
      }
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const per100Of = (r: Row) => (r.source === "database" ? r.dbPer100 : r.aiPer100) ?? {};
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save() {
    const valid = rows.filter((r) => r.name.trim() && Number(r.grams) > 0);
    if (!valid.length) return toast({ tone: "error", text: "Nothing to save — add at least one item with an amount." });
    setSaving(true);
    try {
      for (const r of valid) {
        const p = per100Of(r);
        await api.post("/api/diary", { kind: "estimate", source: "photo", name: r.name.trim().slice(0, 120), per100: { kcal: p.kcal ?? null, proteinG: p.proteinG ?? null, carbsG: p.carbsG ?? null, fatG: p.fatG ?? null, fiberG: p.fiberG ?? null }, grams: Number(r.grams), quantity: 1, unitLabel: `${r.grams} g (photo estimate)`, date, mealType: meal });
      }
      globalMutate((k) => typeof k === "string" && (k.startsWith("/api/diary") || k.startsWith("/api/dashboard")));
      toast({ tone: "success", text: `Saved ${valid.length} item${valid.length === 1 ? "" : "s"} as estimates` });
      router.push(`/nutrition${date !== localToday() ? `?date=${date}` : ""}`);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Analyse a meal photo" subtitle="AI estimates — you review everything before saving" back="/nutrition" />
      {status && !status.configured && <Alert tone="warning" title="AI photo analysis isn't available">This server doesn&apos;t have an AI provider configured. You can still search, scan or quick-add foods.</Alert>}
      {status && status.configured && !status.enabledByUser && <Alert tone="info">AI features are turned off in your privacy settings.</Alert>}

      <Card className="space-y-3">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Choose a meal photo" />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your meal photo" className="max-h-80 w-full rounded-xl object-contain bg-surface-2" />
        ) : (
          <button onClick={() => fileRef.current?.click()} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted hover:bg-surface-2">
            <Camera className="size-8" aria-hidden />
            <span className="text-sm font-medium">Take or choose a photo</span>
            <span className="max-w-xs text-xs">Photos are resized on your device, location data is removed, and the image isn&apos;t stored.</span>
          </button>
        )}
        {preview && (
          <>
            <Field label="Anything we can't see?" htmlFor="hint" optional hint="e.g. 'cooked in butter', 'about 2 cups of rice', 'sauce is tahini'">
              <Input id="hint" value={hint} onChange={(e) => setHint(e.target.value)} maxLength={300} />
            </Field>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => fileRef.current?.click()} icon={<ImagePlus className="size-4" />}>
                Different photo
              </Button>
              <Button className="flex-1" onClick={analyze} loading={busy} disabled={!status?.configured || !status.enabledByUser}>
                Analyse photo
              </Button>
            </div>
          </>
        )}
      </Card>

      {busy && <Spinner label="Looking at your meal… this can take a few seconds" />}

      {result && "refused" in result && result.refused && <Alert tone="warning">{"message" in result ? String(result.message) : "This photo couldn't be analysed."}</Alert>}
      {result && "isFood" in result && result.isFood === false && <Alert tone="info" title="No food found">{result.notes}</Alert>}

      {rows.length > 0 && result && "disclaimer" in result && (
        <>
          <Alert tone="warning" title="Please check these estimates">
            {result.disclaimer} {result.imageQuality && result.imageQuality !== "good" && `Photo quality: ${result.imageQuality.replace("_", " ")}.`} {result.notes}
          </Alert>
          {rows.map((r) => (
            <Card key={r.key} className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Field label="Food" htmlFor={`n-${r.key}`}>
                    <Input id={`n-${r.key}`} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} />
                  </Field>
                </div>
                <div className="w-28">
                  <Field label="Amount (g)" htmlFor={`g-${r.key}`}>
                    <Input id={`g-${r.key}`} inputMode="decimal" value={r.grams} onChange={(e) => update(r.key, { grams: e.target.value })} />
                  </Field>
                </div>
                <button onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.name}`} className="mt-7 inline-flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge tone={r.identificationConfidence === "high" ? "success" : r.identificationConfidence === "low" ? "warning" : "neutral"}>Identification: {r.identificationConfidence}</Badge>
                <Badge tone={r.portionConfidence === "high" ? "success" : r.portionConfidence === "low" ? "warning" : "neutral"}>Portion: {r.portionConfidence}</Badge>
                {r.ingredients.length > 0 && <span className="text-muted">Likely: {r.ingredients.join(", ")}</span>}
              </div>
              <Field label="Nutrition values to use" htmlFor={`s-${r.key}`}>
                <Select id={`s-${r.key}`} value={r.source} onChange={(e) => update(r.key, { source: e.target.value as Row["source"] })}>
                  {r.dbPer100 && <option value="database">Food database: {r.dbName}</option>}
                  {r.aiPer100 && <option value="ai">AI estimate for “{r.name}”</option>}
                  {!r.dbPer100 && !r.aiPer100 && <option value="ai">No nutrition data — will be saved without calories</option>}
                </Select>
              </Field>
              <NutritionPreview per100={per100Of(r)} grams={Number(r.grams) || 0} />
            </Card>
          ))}
          <Button
            variant="secondary"
            className="w-full"
            icon={<Plus className="size-4" />}
            onClick={() => setRows((rs) => [...rs, { key: `new-${Date.now()}`, name: "", grams: "100", source: "ai", dbPer100: null, dbName: null, aiPer100: null, portionConfidence: "low", identificationConfidence: "high", ingredients: [] }])}
          >
            Add something the AI missed
          </Button>
          <Card className="space-y-3">
            <Field label="Meal" htmlFor="meal">
              <Select id="meal" value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
                {MEAL_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {m[0].toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-center gap-2 text-sm text-muted">
              <EstimateBadge /> Saved entries are marked as estimates.
            </div>
            <Button className="w-full" size="lg" onClick={save} loading={saving}>
              Save to diary
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}

export default function PhotoPage() {
  return (
    <Suspense>
      <PhotoAnalyzer />
    </Suspense>
  );
}
