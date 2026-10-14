"use client";

import useSWR from "swr";
import { use } from "react";
import type { Recipe } from "@/lib/client-types";
import { RecipeForm } from "@/components/recipe-form";
import { ErrorState, LoadingCards, PageHeader } from "@/components/ui";

export default function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading } = useSWR<Recipe>(`/api/recipes/${id}`);
  if (isLoading) return <LoadingCards />;
  if (error || !data) return <ErrorState error={error} />;
  return (
    <>
      <PageHeader title="Edit recipe" back={`/nutrition/recipes/${id}`} />
      <RecipeForm initial={data} />
    </>
  );
}
