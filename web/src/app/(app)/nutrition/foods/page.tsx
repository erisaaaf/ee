"use client";

import Link from "next/link";
import useSWR from "swr";
import { Plus } from "lucide-react";
import type { Food } from "@/lib/client-types";
import { Card, EmptyState, ErrorState, LinkButton, LoadingCards, PageHeader, SectionTitle } from "@/components/ui";

export default function MyFoodsPage() {
  const { data, error, isLoading, mutate } = useSWR<Food[]>("/api/foods/custom");
  const { data: favs } = useSWR<Food[]>("/api/foods/favorites");
  return (
    <div className="space-y-4">
      <PageHeader title="My foods" back="/nutrition" actions={<LinkButton href="/nutrition/foods/new" variant="primary" size="sm" icon={<Plus className="size-4" />}>New food</LinkButton>} />
      <Card>
        <SectionTitle>Foods I created</SectionTitle>
        {isLoading ? (
          <LoadingCards count={2} />
        ) : error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : !data?.length ? (
          <EmptyState title="No custom foods yet" action={<LinkButton href="/nutrition/foods/new" variant="soft" size="sm">Create one</LinkButton>}>
            Add foods from a package label or your own favourites.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((f) => (
              <li key={f.id}>
                <Link href={`/nutrition/food/${f.id}`} className="flex items-center justify-between gap-2 py-3 hover:underline">
                  <span className="text-sm font-medium">{f.name}</span>
                  <span className="text-xs text-muted">{f.per100.kcal != null ? `${Math.round(f.per100.kcal)} kcal/100 ${f.isLiquid ? "ml" : "g"}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <SectionTitle>Favourite foods</SectionTitle>
        {!favs?.length ? (
          <p className="text-sm text-muted">Tap the heart when adding a food to keep it here.</p>
        ) : (
          <ul className="divide-y divide-border">
            {favs.map((f) => (
              <li key={f.id}>
                <Link href={`/nutrition/food/${f.id}`} className="block py-3 text-sm font-medium hover:underline">
                  {f.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-sm text-muted">
        Favourite meals live under <Link href="/nutrition/add" className="text-primary hover:underline">Add food → Saved meals</Link>.
      </p>
    </div>
  );
}
