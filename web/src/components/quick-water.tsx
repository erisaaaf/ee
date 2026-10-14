"use client";

import { useState } from "react";
import { Droplet } from "lucide-react";
import { mutate as globalMutate } from "swr";
import { api, errorMessage } from "@/lib/api";
import { formatVolume, flOzToMl } from "@/lib/units";
import { localToday } from "@/lib/dates";
import { postOrQueue } from "./offline";
import { useMe } from "./me";
import { Button, useFeedback } from "./ui";

/** Quick-add water buttons with undo. Works offline (queued). */
export function QuickWater({ date = localToday(), onChange }: { date?: string; onChange?: () => void }) {
  const { units } = useMe();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<number | null>(null);
  const amounts = units === "imperial" ? [8, 12, 16].map((oz) => Math.round(flOzToMl(oz))) : [150, 250, 500];

  async function add(ml: number) {
    setBusy(ml);
    try {
      const r = await postOrQueue<{ data?: { id: string }; id?: string }>("/api/water", { date, amountMl: ml, drink: "water" }, `${ml} ml water`);
      if (r.queued) {
        toast({ tone: "info", text: `Saved offline — ${formatVolume(ml, units)} will sync when you're back online.` });
      } else {
        const id = (r.data as { id?: string }).id;
        toast({
          tone: "success",
          text: `Added ${formatVolume(ml, units)} of water`,
          action: id
            ? {
                label: "Undo",
                onClick: async () => {
                  try {
                    await api.del(`/api/water/${id}`);
                    refresh();
                  } catch (e) {
                    toast({ tone: "error", text: errorMessage(e) });
                  }
                },
              }
            : undefined,
        });
      }
      refresh();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }
  function refresh() {
    onChange?.();
    globalMutate((k) => typeof k === "string" && (k.startsWith("/api/dashboard") || k.startsWith("/api/water")));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {amounts.map((ml) => (
        <Button key={ml} size="sm" variant="soft" onClick={() => add(ml)} loading={busy === ml} disabled={busy !== null} icon={<Droplet className="size-4" aria-hidden />}>
          +{formatVolume(ml, units)}
        </Button>
      ))}
    </div>
  );
}
