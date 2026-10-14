"use client";

import useSWR from "swr";
import { use } from "react";
import type { Food } from "@/lib/client-types";
import { CustomFoodForm } from "@/components/custom-food-form";
import { Alert, ErrorState, LoadingCards, PageHeader } from "@/components/ui";

export default function EditFoodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading } = useSWR<Food>(`/api/foods/${id}`);
  if (isLoading) return <LoadingCards />;
  if (error || !data) return <ErrorState error={error} />;
  return (
    <>
      <PageHeader title="Edit food" back={`/nutrition/food/${id}`} />
      {data.isOwn ? <CustomFoodForm initial={data} /> : <Alert tone="info">Only foods you created can be edited.</Alert>}
    </>
  );
}
