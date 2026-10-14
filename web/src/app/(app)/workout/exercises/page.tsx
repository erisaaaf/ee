"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { Heart } from "lucide-react";
import type { ExerciseListItem } from "@/lib/client-types";
import { EQUIPMENT } from "@/lib/validation";
import { Badge, Card, EmptyState, ErrorState, Input, LoadingCards, PageHeader, Select, Toggle } from "@/components/ui";

const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "core", "obliques", "quads", "glutes", "hamstrings", "calves", "full body"];

export default function ExerciseLibrary() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [doable, setDoable] = useState(false);
  const params = new URLSearchParams(Object.entries({ q, category, muscle, equipment, difficulty, doable: doable ? "true" : "" }).filter(([, v]) => v));
  const { data, error, isLoading, mutate } = useSWR<ExerciseListItem[]>(`/api/exercises?${params}`);

  return (
    <div className="space-y-4">
      <PageHeader title="Exercise library" subtitle={data ? `${data.length} exercises` : undefined} back="/workout" />
      <Card className="space-y-3">
        <Input type="search" aria-label="Search exercises" placeholder="Search by name or muscle" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All types</option>
            {["strength", "core", "cardio", "mobility", "plyometric"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select aria-label="Muscle" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
            <option value="">All muscles</option>
            {MUSCLES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
          <Select aria-label="Equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
            <option value="">Any equipment</option>
            <option value="none">No equipment</option>
            {EQUIPMENT.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">Any level</option>
            {["beginner", "intermediate", "advanced"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </div>
        <Toggle label="Only exercises I can do with my equipment" description="Based on the equipment in your preferences" checked={doable} onChange={setDoable} />
      </Card>
      {isLoading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data?.length ? (
        <EmptyState title="No exercises match these filters">Try removing a filter.</EmptyState>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.map((e) => (
            <li key={e.id}>
              <Link href={`/workout/exercises/${e.slug}`} className="flex h-full flex-col rounded-2xl border border-border bg-surface p-3 hover:bg-surface-2/60">
                <span className="flex items-center gap-1 font-medium">
                  {e.name} {e.isFavorite && <Heart className="size-3.5 fill-fat text-fat" aria-label="Favourite" />}
                </span>
                <span className="text-xs text-muted">{e.muscleGroups.join(", ")}</span>
                <span className="mt-2 flex flex-wrap gap-1">
                  <Badge>{e.difficulty}</Badge>
                  <Badge tone={e.equipment.length ? "neutral" : "success"}>{e.equipment.length ? e.equipment.join(", ").replace(/_/g, " ") : "no equipment"}</Badge>
                  {!e.doable && <Badge tone="warning">needs equipment you don&apos;t have</Badge>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
