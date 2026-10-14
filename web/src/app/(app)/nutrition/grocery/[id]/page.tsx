"use client";

import useSWR from "swr";
import { use, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { Button, Card, ErrorState, Input, LoadingCards, PageHeader, useFeedback } from "@/components/ui";

type List = { id: string; title: string; planId: string | null; items: { id: string; name: string; category: string; quantity: string | null; checked: boolean }[] };

export default function GroceryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useFeedback();
  const { data, error, isLoading, mutate } = useSWR<List>(`/api/grocery/${id}`);
  const [name, setName] = useState("");
  if (isLoading) return <LoadingCards />;
  if (error || !data) return <ErrorState error={error} onRetry={() => mutate()} />;

  async function op(body: Record<string, unknown>) {
    try {
      await mutate(await api.patch<List>(`/api/grocery/${id}`, body), false);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }
  const groups = [...new Set(data.items.map((i) => i.category))];
  const done = data.items.filter((i) => i.checked).length;

  return (
    <div className="space-y-4">
      <PageHeader title={data.title} subtitle={`${done} of ${data.items.length} checked`} back={data.planId ? `/nutrition/plans/${data.planId}` : "/nutrition"} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) op({ op: "add", name: name.trim() }).then(() => setName(""));
        }}
      >
        <Input aria-label="Add item" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item" />
        <Button type="submit" variant="secondary" icon={<Plus className="size-4" />}>
          Add
        </Button>
      </form>
      {groups.map((g) => (
        <Card key={g}>
          <h2 className="mb-2 text-sm font-semibold">{g}</h2>
          <ul className="divide-y divide-border">
            {data.items
              .filter((i) => i.category === g)
              .map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2">
                  <input type="checkbox" id={`gi-${i.id}`} checked={i.checked} onChange={(e) => op({ op: "update", itemId: i.id, checked: e.target.checked })} className="size-5 accent-[var(--primary)]" />
                  <label htmlFor={`gi-${i.id}`} className={`flex-1 text-sm ${i.checked ? "text-muted line-through" : ""}`}>
                    {i.name}
                  </label>
                  <input
                    aria-label={`Quantity of ${i.name}`}
                    defaultValue={i.quantity ?? ""}
                    onBlur={(e) => e.target.value !== (i.quantity ?? "") && op({ op: "update", itemId: i.id, quantity: e.target.value || null })}
                    className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-right text-sm"
                  />
                  <button onClick={() => op({ op: "remove", itemId: i.id })} aria-label={`Remove ${i.name}`} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
          </ul>
        </Card>
      ))}
      {done > 0 && (
        <Button variant="secondary" onClick={() => op({ op: "clear_checked" })}>
          Remove checked items
        </Button>
      )}
    </div>
  );
}
