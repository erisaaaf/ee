"use client";

import useSWR from "swr";
import { useState } from "react";
import type { ExerciseListItem } from "@/lib/client-types";
import { Badge, Input, Sheet, Toggle } from "./ui";

export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: ExerciseListItem) => void }) {
  const [q, setQ] = useState("");
  const [doable, setDoable] = useState(true);
  const { data } = useSWR<ExerciseListItem[]>(open ? `/api/exercises?q=${encodeURIComponent(q)}${doable ? "&doable=true" : ""}` : null);
  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <div className="space-y-3">
        <Input aria-label="Search exercises" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <Toggle label="Only with my equipment" checked={doable} onChange={setDoable} />
        <ul className="divide-y divide-border">
          {data?.map((e) => (
            <li key={e.id}>
              <button
                className="flex w-full items-center justify-between gap-2 py-2.5 text-left hover:bg-surface-2"
                onClick={() => {
                  onPick(e);
                  onClose();
                }}
              >
                <span>
                  <span className="block text-sm font-medium">{e.name}</span>
                  <span className="text-xs text-muted">{e.muscleGroups.join(", ")}</span>
                </span>
                <Badge>{e.equipment.length ? e.equipment[0].replace("_", " ") : "bodyweight"}</Badge>
              </button>
            </li>
          ))}
          {data?.length === 0 && <li className="py-3 text-sm text-muted">No exercises found.</li>}
        </ul>
      </div>
    </Sheet>
  );
}
