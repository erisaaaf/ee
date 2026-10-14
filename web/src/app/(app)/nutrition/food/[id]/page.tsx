"use client";

import Link from "next/link";
import useSWR from "swr";
import { use, useState } from "react";
import { Sparkles } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { localToday } from "@/lib/dates";
import { MACRO_KEYS, MICRO_KEYS, NUTRIENT_META } from "@/lib/nutrition";
import { foodName } from "@/lib/i18n";
import type { Food, Swaps, AiStatus } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { FoodLogSheet } from "@/components/food-log-sheet";
import { Alert, Badge, Button, Card, DataQualityBadge, ErrorState, LinkButton, LoadingCards, PageHeader, SectionTitle, Spinner, useFeedback } from "@/components/ui";

type AiSwap = { instead: string; tryThis: string; why: string; tradeOff: string; allergenWarnings: string[] };

export default function FoodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { lang } = useMe();
  const { toast } = useFeedback();
  const { data: food, error, isLoading, mutate } = useSWR<Food>(`/api/foods/${id}`);
  const { data: swaps } = useSWR<Swaps>(`/api/swaps/${id}`);
  const { data: ai } = useSWR<AiStatus>("/api/ai/status");
  const [logging, setLogging] = useState<Food | null>(null);
  const [aiSwaps, setAiSwaps] = useState<AiSwap[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  if (isLoading) return <LoadingCards />;
  if (error || !food) return <ErrorState error={error} onRetry={() => mutate()} />;

  async function askAi() {
    setAiBusy(true);
    try {
      setAiSwaps(await api.post<AiSwap[]>("/api/ai/swaps", { item: food!.name }));
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setAiBusy(false);
    }
  }

  const unit = food.isLiquid ? "100 ml" : "100 g";
  const sourceText: Record<string, string> = {
    builtin: food.dataQuality === "estimate" ? "Built-in estimate for a typical recipe" : "Built-in typical values (public food-composition tables)",
    openfoodfacts: "Open Food Facts (community product data)",
    usda: "USDA FoodData Central",
    user: "Created by you",
  };

  return (
    <div className="space-y-4">
      <PageHeader title={foodName(food, lang)} subtitle={food.brand ?? undefined} back="/nutrition/add" actions={<Button onClick={() => setLogging(food)}>Log this</Button>} />
      <div className="flex flex-wrap gap-2">
        <DataQualityBadge quality={food.dataQuality} />
        {food.barcode && <Badge>Barcode {food.barcode}</Badge>}
        {food.isOwn && <LinkButton href={`/nutrition/foods/${food.id}`} size="sm" variant="ghost">Edit</LinkButton>}
      </div>
      <Card>
        <SectionTitle>Nutrition per {unit}</SectionTitle>
        <dl className="divide-y divide-border text-sm">
          {MACRO_KEYS.map((k) => (
            <div key={k} className="flex justify-between py-2">
              <dt>{NUTRIENT_META[k].label}</dt>
              <dd className="tabular font-medium">{food.per100[k] == null ? <span className="text-muted">unknown</span> : `${Math.round(food.per100[k]! * 10) / 10} ${NUTRIENT_META[k].unit}`}</dd>
            </div>
          ))}
        </dl>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-primary">Vitamins & minerals</summary>
          <dl className="mt-2 divide-y divide-border text-sm">
            {MICRO_KEYS.map((k) => (
              <div key={k} className="flex justify-between py-2">
                <dt>{NUTRIENT_META[k].label}</dt>
                <dd className="tabular">{food.per100[k] == null ? <span className="text-muted">no data</span> : `${food.per100[k]} ${NUTRIENT_META[k].unit}`}</dd>
              </div>
            ))}
          </dl>
        </details>
        <p className="mt-3 text-xs text-muted">Source: {sourceText[food.source] ?? food.source}.</p>
      </Card>

      <Card>
        <SectionTitle>Alternatives you could try</SectionTitle>
        {!swaps ? (
          <Spinner />
        ) : swaps.suggestions.length === 0 ? (
          <p className="text-sm text-muted">No clear alternatives in the database for this food.</p>
        ) : (
          <ul className="space-y-2">
            {swaps.suggestions.map((s) => (
              <li key={s.food.id} className="rounded-xl bg-surface-2/60 p-3">
                <Link href={`/nutrition/food/${s.food.id}`} className="text-sm font-medium hover:underline">
                  {foodName(s.food, lang)}
                </Link>
                <p className="text-xs text-muted">{s.why}</p>
              </li>
            ))}
          </ul>
        )}
        {swaps && <p className="mt-3 text-xs text-muted">{swaps.note}</p>}
        {ai?.configured && ai.enabledByUser && (
          <div className="mt-3 border-t border-border pt-3">
            {aiSwaps ? (
              <ul className="space-y-2">
                {aiSwaps.map((s, i) => (
                  <li key={i} className="rounded-xl bg-primary-soft/40 p-3 text-sm">
                    <p className="font-medium">
                      {s.tryThis} <Badge tone="primary">AI suggestion</Badge>
                    </p>
                    <p className="text-muted">{s.why}</p>
                    {s.tradeOff && <p className="text-xs text-muted">Trade-off: {s.tradeOff}</p>}
                    {s.allergenWarnings.length > 0 && <Alert tone="danger">May conflict with: {s.allergenWarnings.join(", ")}</Alert>}
                  </li>
                ))}
              </ul>
            ) : (
              <Button variant="soft" size="sm" onClick={askAi} loading={aiBusy} icon={<Sparkles className="size-4" />}>
                Ask AI for more ideas
              </Button>
            )}
          </div>
        )}
      </Card>
      <FoodLogSheet food={logging} open={!!logging} onClose={() => setLogging(null)} date={localToday()} />
    </div>
  );
}
