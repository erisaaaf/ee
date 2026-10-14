"use client";

import Link from "next/link";
import useSWR from "swr";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Globe, Plus, ScanLine, Search } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { localToday } from "@/lib/dates";
import type { Food } from "@/lib/client-types";
import type { MealType } from "@/lib/nutrition";
import { foodName } from "@/lib/i18n";
import { useMe } from "@/components/me";
import { FoodLogSheet, defaultMeal } from "@/components/food-log-sheet";
import { postOrQueue } from "@/components/offline";
import { Alert, Badge, Button, Card, DataQualityBadge, EmptyState, ErrorState, Field, Input, LinkButton, PageHeader, Segmented, Spinner, useFeedback } from "@/components/ui";

type External = { provider: "openfoodfacts" | "usda"; ref: string; name: string; brand: string | null; per100: Food["per100"]; attribution: string };
type SavedMeal = { id: string; name: string; mealType: string | null; items: { name: string; grams: number }[]; totals: { values: Record<string, number> } };

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

function FoodRow({ f, onPick, extra }: { f: Food; onPick: () => void; extra?: string }) {
  const { lang } = useMe();
  return (
    <li>
      <button onClick={onPick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{foodName(f, lang)}</p>
          <p className="truncate text-xs text-muted">
            {[f.brand, f.per100.kcal != null ? `${Math.round(f.per100.kcal)} kcal / 100 ${f.isLiquid ? "ml" : "g"}` : "energy unknown", extra].filter(Boolean).join(" · ")}
          </p>
        </div>
        <DataQualityBadge quality={f.dataQuality} />
        <Plus className="size-4 text-primary" aria-hidden />
      </button>
    </li>
  );
}

function QuickAdd({ date, meal }: { date: string; meal: MealType }) {
  const { toast } = useFeedback();
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [fat, setFat] = useState("");
  const [busy, setBusy] = useState(false);
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  async function save() {
    const k = n(kcal);
    if (!name.trim() || k == null || !(k >= 0)) return toast({ tone: "error", text: "Enter a name and calories." });
    setBusy(true);
    try {
      // Values are for the whole portion; store as a 100 g "portion" so totals equal what was entered.
      const r = await postOrQueue("/api/diary", { kind: "estimate", name: name.trim(), per100: { kcal: k, proteinG: n(p), carbsG: n(c), fatG: n(fat) }, grams: 100, quantity: 1, unitLabel: "portion", date, mealType: meal, source: "quick" }, name);
      toast({ tone: r.queued ? "info" : "success", text: r.queued ? "Saved offline." : "Added as an estimate" });
      setName("");
      setKcal("");
      setP("");
      setC("");
      setFat("");
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">Know roughly what you ate but can&apos;t find it? Add a quick estimate for the whole portion. It&apos;s marked as an estimate.</p>
      <Field label="What was it?" htmlFor="qa-name">
        <Input id="qa-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grandma's pite" maxLength={120} />
      </Field>
      <div className="grid grid-cols-4 gap-2">
        <Field label="kcal" htmlFor="qa-k">
          <Input id="qa-k" inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </Field>
        <Field label="Protein g" htmlFor="qa-p">
          <Input id="qa-p" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} />
        </Field>
        <Field label="Carbs g" htmlFor="qa-c">
          <Input id="qa-c" inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} />
        </Field>
        <Field label="Fat g" htmlFor="qa-f">
          <Input id="qa-f" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} />
        </Field>
      </div>
      <Button onClick={save} loading={busy} className="w-full">
        Add estimate
      </Button>
    </Card>
  );
}

function AddFood() {
  const params = useSearchParams();
  const date = params.get("date") ?? localToday();
  const meal = (params.get("meal") as MealType) ?? defaultMeal();
  const { toast } = useFeedback();
  const [tab, setTab] = useState<"search" | "recent" | "favorites" | "meals" | "quick">("search");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [picked, setPicked] = useState<Food | null>(null);
  const { data: results, error, isLoading } = useSWR<Food[]>(tab === "search" && dq.trim().length >= 2 ? `/api/foods?q=${encodeURIComponent(dq)}` : null);
  const { data: recent } = useSWR<(Food & { lastGrams: number })[]>(tab === "recent" || (tab === "search" && !dq) ? "/api/foods/recent" : null);
  const { data: favs } = useSWR<Food[]>(tab === "favorites" ? "/api/foods/favorites" : null);
  const { data: meals, mutate: mutateMeals } = useSWR<SavedMeal[]>(tab === "meals" ? "/api/meals" : null);
  const [ext, setExt] = useState<{ results: External[]; errors: string[] } | null>(null);
  const [extLoading, setExtLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  async function searchOnline() {
    setExtLoading(true);
    setExt(null);
    try {
      setExt(await api.get(`/api/foods/external?q=${encodeURIComponent(q)}`));
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setExtLoading(false);
    }
  }
  async function pickExternal(x: External) {
    setImporting(x.ref);
    try {
      setPicked(await api.post<Food>("/api/foods/external/import", { provider: x.provider, ref: x.ref }));
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setImporting(null);
    }
  }
  async function logMeal(m: SavedMeal) {
    try {
      await api.post(`/api/meals/${m.id}/log`, { date, mealType: meal });
      toast({ tone: "success", text: `Logged "${m.name}" to ${meal}` });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }
  async function deleteMeal(m: SavedMeal) {
    try {
      await api.del(`/api/meals/${m.id}`);
      mutateMeals();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Add food" subtitle={`To ${meal} · ${date === localToday() ? "today" : date}`} back={`/nutrition${date !== localToday() ? `?date=${date}` : ""}`} actions={<LinkButton href={`/nutrition/scan?date=${date}`} size="sm" icon={<ScanLine className="size-4" />}>Scan</LinkButton>} />
      <div className="overflow-x-auto">
        <Segmented
          label="Add food from"
          value={tab}
          onChange={setTab}
          options={[
            { value: "search", label: "Search" },
            { value: "recent", label: "Recent" },
            { value: "favorites", label: "Favourites" },
            { value: "meals", label: "Saved meals" },
            { value: "quick", label: "Quick add" },
          ]}
        />
      </div>

      {tab === "search" && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              type="search"
              aria-label="Search foods"
              placeholder="Search foods (e.g. byrek, kos, chicken)"
              className="pl-9"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setExt(null);
              }}
              autoFocus
            />
          </div>
          {!dq ? (
            recent && recent.length > 0 ? (
              <Card>
                <h2 className="mb-1 text-sm font-semibold">Recent</h2>
                <ul className="-mx-2">
                  {recent.slice(0, 8).map((f) => (
                    <FoodRow key={f.id} f={f} onPick={() => setPicked(f)} extra={`last ${Math.round(f.lastGrams)} g`} />
                  ))}
                </ul>
              </Card>
            ) : (
              <p className="text-sm text-muted">Start typing to search. Includes common foods, local Balkan dishes and your own foods.</p>
            )
          ) : isLoading ? (
            <Spinner label="Searching…" />
          ) : error ? (
            <ErrorState error={error} />
          ) : (
            <Card>
              {results && results.length > 0 ? (
                <ul className="-mx-2">
                  {results.map((f) => (
                    <FoodRow key={f.id} f={f} onPick={() => setPicked(f)} />
                  ))}
                </ul>
              ) : (
                <EmptyState title={`No matches for “${dq}” in the food database`}>Try a simpler word, search packaged foods online, or create the food yourself.</EmptyState>
              )}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                <Button size="sm" variant="secondary" onClick={searchOnline} loading={extLoading} icon={<Globe className="size-4" />} disabled={dq.length < 2}>
                  Search packaged foods online
                </Button>
                <LinkButton href={`/nutrition/foods/new?name=${encodeURIComponent(q)}`} size="sm" variant="ghost" icon={<Plus className="size-4" />}>
                  Create custom food
                </LinkButton>
              </div>
            </Card>
          )}
          {ext && (
            <Card>
              <h2 className="mb-1 text-sm font-semibold">Online results</h2>
              {ext.errors.map((e) => (
                <Alert key={e} tone="warning">
                  {e}
                </Alert>
              ))}
              {ext.results.length === 0 ? (
                <p className="py-2 text-sm text-muted">No online products found.</p>
              ) : (
                <ul className="-mx-2">
                  {ext.results.map((x) => (
                    <li key={`${x.provider}-${x.ref}`}>
                      <button onClick={() => pickExternal(x)} disabled={importing === x.ref} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2 disabled:opacity-50">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{x.name}</p>
                          <p className="truncate text-xs text-muted">{[x.brand, x.per100.kcal != null ? `${Math.round(x.per100.kcal)} kcal/100 g` : null].filter(Boolean).join(" · ")}</p>
                        </div>
                        <Badge tone="info">{x.provider === "usda" ? "USDA" : "Open Food Facts"}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted">Product data from Open Food Facts is community-contributed (ODbL); check it against the label.</p>
            </Card>
          )}
        </>
      )}

      {tab === "recent" && (
        <Card>
          {!recent ? (
            <Spinner />
          ) : recent.length === 0 ? (
            <EmptyState title="No recent foods yet">Foods you log will show up here for quick re-logging.</EmptyState>
          ) : (
            <ul className="-mx-2">
              {recent.map((f) => (
                <FoodRow key={f.id} f={f} onPick={() => setPicked(f)} extra={`last ${Math.round(f.lastGrams)} g`} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "favorites" && (
        <Card>
          {!favs ? (
            <Spinner />
          ) : favs.length === 0 ? (
            <EmptyState title="No favourite foods yet">Tap the heart when adding a food to save it here.</EmptyState>
          ) : (
            <ul className="-mx-2">
              {favs.map((f) => (
                <FoodRow key={f.id} f={f} onPick={() => setPicked(f)} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "meals" && (
        <Card>
          {!meals ? (
            <Spinner />
          ) : meals.length === 0 ? (
            <EmptyState title="No saved meals yet">In your diary, open a meal&apos;s ••• menu and choose “Save favourite meal”.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {meals.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted">
                      {m.items.map((i) => i.name).join(", ")} · {Math.round(m.totals.values.kcal)} kcal
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deleteMeal(m)} aria-label={`Delete saved meal ${m.name}`}>
                    Remove
                  </Button>
                  <Button size="sm" onClick={() => logMeal(m)}>
                    Log
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "quick" && <QuickAdd date={date} meal={meal} />}

      <p className="text-center text-sm text-muted">
        Cooked it yourself? <Link href="/nutrition/recipes/new" className="text-primary hover:underline">Create a recipe</Link> and log servings.
      </p>

      <FoodLogSheet food={picked} open={!!picked} onClose={() => setPicked(null)} date={date} meal={meal} />
    </div>
  );
}

export default function AddFoodPage() {
  return (
    <Suspense>
      <AddFood />
    </Suspense>
  );
}
