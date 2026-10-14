"use client";

import Link from "next/link";
import useSWR from "swr";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Camera, ChefHat, ChevronLeft, ChevronRight, Copy, Droplet, Heart, ListChecks, MoreHorizontal, Plus, ScanLine, Sparkles, Star } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { addDays, localToday } from "@/lib/dates";
import { MEAL_TYPES, MICRO_KEYS, NUTRIENT_META, type MealType } from "@/lib/nutrition";
import type { DayDiary, Entry } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { Badge, Button, Card, EstimateBadge, ErrorState, Field, InfoTip, Input, LinkButton, LoadingCards, PageHeader, ProgressBar, Select, Sheet, useFeedback } from "@/components/ui";

type Micros = { values: Record<string, number>; missing: Record<string, number>; count: number };

function EntryRow({ e, onEdit }: { e: Entry; onEdit: () => void }) {
  return (
    <li>
      <button onClick={onEdit} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{e.name}</p>
          <p className="text-xs text-muted">
            {e.quantity !== 1 || e.unitLabel !== "g" ? `${e.quantity} × ${e.unitLabel} · ` : ""}
            {Math.round(e.grams)} g{e.source === "photo" ? " · from photo" : e.source === "barcode" ? " · scanned" : ""}
          </p>
        </div>
        {e.isEstimate && <EstimateBadge />}
        <span className="tabular text-sm font-medium">{e.totals.kcal == null ? "?" : Math.round(e.totals.kcal)}</span>
      </button>
    </li>
  );
}

function EditEntrySheet({ entry, onClose, onDone }: { entry: Entry | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback();
  const [grams, setGrams] = useState("");
  const [meal, setMeal] = useState<MealType>("snack");
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (entry && entry.id !== lastId) {
    setLastId(entry.id);
    setGrams(String(Math.round(entry.grams)));
    setMeal(entry.mealType as MealType);
  }
  if (!entry) return null;
  const g = Number(grams);
  async function save() {
    setBusy(true);
    try {
      await api.patch(`/api/diary/${entry!.id}`, { grams: g, quantity: Math.round((g / entry!.grams) * entry!.quantity * 100) / 100, mealType: meal });
      onDone();
      onClose();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/diary/${entry!.id}`);
      toast({ tone: "success", text: `Removed ${entry!.name}` });
      onDone();
      onClose();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={!!entry}
      onClose={onClose}
      title={entry.name}
      footer={
        <>
          <Button variant="danger" onClick={remove} disabled={busy}>
            Delete
          </Button>
          <Button onClick={save} loading={busy} disabled={!(g > 0)}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {entry.isEstimate && <EstimateBadge label="Estimated values" />}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (g)" htmlFor="eg">
            <Input id="eg" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
          </Field>
          <Field label="Meal" htmlFor="em">
            <Select id="em" value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
              {MEAL_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m[0].toUpperCase() + m.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-sm text-muted">Totals update everywhere (diary, dashboard, charts) when you save.</p>
      </div>
    </Sheet>
  );
}

function MealMenu({ date, meal, hasEntries, onDone }: { date: string; meal: MealType; hasEntries: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  async function copyYesterday() {
    setBusy(true);
    try {
      const r = await api.post<{ copied: number }>("/api/diary/copy", { from: { date: addDays(date, -1), mealType: meal }, to: { date, mealType: meal } });
      toast({ tone: "success", text: `Copied ${r.copied} item${r.copied === 1 ? "" : "s"} from yesterday` });
      onDone();
      setOpen(false);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  async function saveMeal() {
    setBusy(true);
    try {
      await api.post("/api/meals", { date, mealType: meal, name: name || `My ${meal}` });
      toast({ tone: "success", text: "Saved to your favourite meals" });
      setOpen(false);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`More options for ${meal}`} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
        <MoreHorizontal className="size-4" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`${meal[0].toUpperCase() + meal.slice(1)} options`}>
        <div className="space-y-4">
          <Button variant="secondary" className="w-full" onClick={copyYesterday} loading={busy} icon={<Copy className="size-4" />}>
            Copy yesterday&apos;s {meal}
          </Button>
          {hasEntries && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <Field label="Save this meal as a favourite" htmlFor="mname">
                <Input id="mname" value={name} onChange={(e) => setName(e.target.value)} placeholder={`My ${meal}`} maxLength={80} />
              </Field>
              <Button className="w-full" onClick={saveMeal} loading={busy} icon={<Star className="size-4" />}>
                Save favourite meal
              </Button>
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}

function MicroSection({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useSWR<Micros>(open ? `/api/diary/micros?date=${date}` : null);
  return (
    <details className="rounded-2xl border border-border bg-surface p-4" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer items-center gap-1 text-sm font-medium">
        Vitamins & minerals (advanced) <InfoTip term="micros" />
      </summary>
      {!data ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : data.count === 0 ? (
        <p className="mt-3 text-sm text-muted">Log some food to see micronutrients.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {[...MICRO_KEYS, "sodiumMg" as const, "fiberG" as const, "sugarG" as const].map((k) => (
            <div key={k} className="flex justify-between gap-2">
              <dt className="text-muted">{NUTRIENT_META[k].label}</dt>
              <dd className="tabular">
                {data.missing[k] === data.count ? "no data" : `${Math.round(data.values[k] * 10) / 10} ${NUTRIENT_META[k].unit}`}
                {data.missing[k] > 0 && data.missing[k] < data.count && <span className="text-xs text-muted"> (partial)</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-xs text-muted">Only foods with micronutrient data contribute. “Partial” means some foods lack data, so the real amount is likely higher.</p>
    </details>
  );
}

function NutritionDiary() {
  const { t, me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const today = localToday();
  const date = params.get("date") ?? today;
  const { data, error, isLoading, mutate } = useSWR<DayDiary>(`/api/diary?date=${date}`);
  const [editing, setEditing] = useState<Entry | null>(null);
  const go = (d: string) => router.replace(d === today ? "/nutrition" : `/nutrition?date=${d}`);
  const tg = me.targets;

  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.nutrition")} actions={<LinkButton href="/hydration" size="sm" variant="ghost" icon={<Droplet className="size-4" />}>Water</LinkButton>} />

      <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-2 py-1">
        <button aria-label="Previous day" onClick={() => go(addDays(date, -1))} className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-surface-2">
          <ChevronLeft className="size-5" />
        </button>
        <label className="flex items-center gap-2 text-sm font-medium">
          <span className="sr-only">Date</span>
          {date === today ? "Today" : new Date(`${date}T12:00:00Z`).toLocaleDateString(me.profile.language, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
          <input type="date" value={date} max={addDays(today, 1)} onChange={(e) => e.target.value && go(e.target.value)} className="w-9 cursor-pointer bg-transparent text-transparent [&::-webkit-calendar-picker-indicator]:opacity-60" aria-label="Pick a date" />
        </label>
        <button aria-label="Next day" onClick={() => go(addDays(date, 1))} disabled={date >= today} className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-surface-2 disabled:opacity-30">
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Primary actions */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { href: `/nutrition/add?date=${date}`, label: t("nutrition.addFood"), icon: Plus },
          { href: `/nutrition/scan?date=${date}`, label: t("nutrition.scan"), icon: ScanLine },
          { href: `/nutrition/photo?date=${date}`, label: t("nutrition.photo"), icon: Camera },
          { href: "/nutrition/recipes/new", label: t("nutrition.recipe"), icon: ChefHat },
          { href: "/coach?q=Help+me+with+my+nutrition+today", label: t("nutrition.askAi"), icon: Sparkles },
        ].map((a) => (
          <Link key={a.href} href={a.href} className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-surface p-2 text-center text-xs font-medium hover:bg-surface-2">
            <a.icon className="size-5 text-primary" aria-hidden />
            {a.label}
          </Link>
        ))}
      </div>

      {isLoading ? (
        <LoadingCards count={3} />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : (
        <>
          <Card aria-label="Day totals">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Totals</h2>
              {data.estimateCount > 0 && <Badge tone="warning">Includes {data.estimateCount} estimate{data.estimateCount === 1 ? "" : "s"}</Badge>}
            </div>
            <div className="space-y-3">
              {(
                [
                  ["kcal", t("metric.calories"), tg.calorieTarget, "kcal", "var(--kcal)"],
                  ["proteinG", t("metric.protein"), tg.proteinTargetG, "g", "var(--protein)"],
                  ["carbsG", t("metric.carbs"), tg.carbTargetG, "g", "var(--carbs)"],
                  ["fatG", t("metric.fat"), tg.fatTargetG, "g", "var(--fat)"],
                  ["fiberG", "Fibre", tg.fiberTargetG, "g", "var(--fiber)"],
                ] as const
              ).map(([k, label, target, unit, color]) => (
                <div key={k}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="tabular text-muted">
                      <span className="font-semibold text-text">{Math.round(data.totals.values[k])}</span>
                      {target ? ` / ${target}` : ""} {unit}
                      {data.totals.missing[k] > 0 && <span title="Some foods have no data for this nutrient"> *</span>}
                    </span>
                  </div>
                  <ProgressBar value={data.totals.values[k]} max={target} color={color} label={label} className="mt-1" />
                </div>
              ))}
            </div>
            {Object.values(data.totals.missing).some((m) => m > 0) && <p className="mt-3 text-xs text-muted">* Some items have no data for this nutrient, so the real total may be higher.</p>}
            {tg.targetsSource === "calculated" && tg.calorieTarget && <p className="mt-2 text-xs text-muted">Targets are estimates. <Link href="/settings/targets" className="underline">Change them</Link></p>}
          </Card>

          {MEAL_TYPES.map((m) => {
            const meal = data.meals[m];
            return (
              <Card key={m} aria-labelledby={`meal-${m}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h2 id={`meal-${m}`} className="font-semibold">
                    {t(`meal.${m}`)}
                  </h2>
                  <div className="flex items-center gap-1">
                    <span className="tabular text-sm text-muted">{meal.entries.length ? `${Math.round(meal.totals.values.kcal)} kcal` : ""}</span>
                    <MealMenu date={date} meal={m} hasEntries={meal.entries.length > 0} onDone={() => mutate()} />
                    <LinkButton href={`/nutrition/add?date=${date}&meal=${m}`} size="sm" variant="soft" icon={<Plus className="size-4" />}>
                      <span className="sr-only">Add to {m}</span>
                    </LinkButton>
                  </div>
                </div>
                {meal.entries.length === 0 ? (
                  <p className="py-2 text-sm text-muted">Nothing logged.</p>
                ) : (
                  <ul className="-mx-2">
                    {meal.entries.map((e) => (
                      <EntryRow key={e.id} e={e} onEdit={() => setEditing(e)} />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}

          <MicroSection date={date} />
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <LinkButton href="/nutrition/recipes" icon={<BookOpen className="size-4" />}>Recipes</LinkButton>
        <LinkButton href="/nutrition/plans" icon={<ListChecks className="size-4" />}>Meal plans</LinkButton>
        <LinkButton href="/nutrition/foods" icon={<Heart className="size-4" />}>My foods & meals</LinkButton>
        <LinkButton href="/nutrition/ideas" icon={<ChefHat className="size-4" />}>What can I cook?</LinkButton>
      </div>

      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} onDone={() => mutate()} />
    </div>
  );
}

export default function NutritionPage() {
  return (
    <Suspense fallback={<LoadingCards />}>
      <NutritionDiary />
    </Suspense>
  );
}
