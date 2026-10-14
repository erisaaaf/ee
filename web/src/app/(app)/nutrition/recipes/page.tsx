"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { ChefHat, Heart, Plus, Sparkles } from "lucide-react";
import type { RecipeListItem } from "@/lib/client-types";
import { Badge, Card, EmptyState, ErrorState, EstimateBadge, Input, LinkButton, LoadingCards, PageHeader } from "@/components/ui";

export default function RecipesPage() {
  const [q, setQ] = useState("");
  const { data, error, isLoading, mutate } = useSWR<RecipeListItem[]>(`/api/recipes${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Recipes"
        back="/nutrition"
        actions={
          <>
            <LinkButton href="/nutrition/ideas" size="sm" icon={<Sparkles className="size-4" />}>
              Ideas
            </LinkButton>
            <LinkButton href="/nutrition/recipes/new" size="sm" variant="primary" icon={<Plus className="size-4" />}>
              New
            </LinkButton>
          </>
        }
      />
      <Input type="search" aria-label="Search recipes" placeholder="Search your recipes" value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data?.length ? (
        <EmptyState icon={<ChefHat className="size-8" />} title={q ? "No recipes match" : "No recipes yet"} action={<LinkButton href="/nutrition/recipes/new" variant="primary">Create your first recipe</LinkButton>}>
          Save homemade meals once, then log a serving in one tap.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((r) => (
            <Card as="li" key={r.id} className="p-0">
              <Link href={`/nutrition/recipes/${r.id}`} className="flex gap-3 p-4 hover:bg-surface-2/50">
                {r.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.photo} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <ChefHat className="size-6" aria-hidden />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-medium">
                    {r.name} {r.isFavorite && <Heart className="size-3.5 fill-fat text-fat" aria-label="Favourite" />}
                  </p>
                  <p className="text-xs text-muted">
                    {r.perServing.kcal} kcal · P {Math.round(r.perServing.proteinG)} g per serving · {r.servings} serving{r.servings === 1 ? "" : "s"}
                  </p>
                  <div className="mt-1 flex gap-1">
                    {!r.complete && <EstimateBadge label="Incomplete" />}
                    {r.source === "ai" && <Badge tone="primary">AI recipe</Badge>}
                  </div>
                </div>
              </Link>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
