"use client";

import Link from "next/link";
import useSWR from "swr";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { SearchResult } from "@/lib/client-types";
import { Card, EmptyState, Input, PageHeader, Spinner } from "@/components/ui";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading } = useSWR<SearchResult>(dq.length >= 2 ? `/api/search?q=${encodeURIComponent(dq)}` : null);
  return (
    <div className="space-y-4">
      <PageHeader title="Search" />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input type="search" autoFocus aria-label="Search everything" className="pl-9" placeholder="Foods, recipes, exercises, workouts, sports, goals, AI chats…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {dq.length < 2 ? (
        <p className="text-sm text-muted">Type at least 2 characters.</p>
      ) : isLoading ? (
        <Spinner label="Searching…" />
      ) : !data?.groups.length ? (
        <EmptyState title={`Nothing found for “${dq}”`}>Try a different word.</EmptyState>
      ) : (
        data.groups.map((g) => (
          <Card key={g.key}>
            <h2 className="mb-1 text-sm font-semibold">{g.label}</h2>
            <ul className="divide-y divide-border">
              {g.items.map((i, idx) => (
                <li key={`${i.href}-${idx}`}>
                  <Link href={i.href} className="block py-2.5 hover:underline">
                    <span className="block text-sm font-medium">{i.title}</span>
                    {i.subtitle && <span className="text-xs text-muted">{i.subtitle}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
