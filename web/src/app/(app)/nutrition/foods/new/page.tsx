"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CustomFoodForm } from "@/components/custom-food-form";
import { PageHeader } from "@/components/ui";

function NewFood() {
  const p = useSearchParams();
  return (
    <>
      <PageHeader title="Create a food" subtitle="Your own foods are private to you" back="/nutrition/foods" />
      <CustomFoodForm barcode={p.get("barcode")} name={p.get("name")} />
    </>
  );
}

export default function NewFoodPage() {
  return (
    <Suspense>
      <NewFood />
    </Suspense>
  );
}
