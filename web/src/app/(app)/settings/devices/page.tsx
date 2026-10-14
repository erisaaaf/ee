"use client";

import useSWR from "swr";
import { useRef, useState } from "react";
import { FileUp, Unplug } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { addDays, localToday } from "@/lib/dates";
import { AppleHealthAggregator } from "@/lib/apple-health";
import { SPORTS } from "@/lib/sports";
import type { Integration } from "@/lib/client-types";
import { Alert, Badge, Button, Card, Chips, ErrorState, Field, LoadingCards, PageHeader, Select, Spinner, useFeedback } from "@/components/ui";

const CAT_LABELS: Record<string, string> = { steps: "Steps", sleep: "Sleep", heart_rate: "Resting heart rate", workouts: "Workouts", calories: "Calories", distance: "Distance", active_minutes: "Active minutes" };

function AppleImport({ p, onDone }: { p: Integration; onDone: () => void }) {
  const { toast } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cats, setCats] = useState<string[]>(p.allowedCategories.length ? p.allowedCategories : ["steps", "sleep"]);
  const [since, setSince] = useState("90");
  const [progress, setProgress] = useState<string | null>(null);

  async function run(file: File) {
    if (!cats.length) return toast({ tone: "error", text: "Choose at least one type of data to import." });
    try {
      await api.post("/api/integrations", { provider: p.key, categories: cats });
      const agg = new AppleHealthAggregator();
      const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let read = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        read += value.length;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) agg.line(l);
        setProgress(`Reading… ${Math.min(99, Math.round((read / file.size) * 100))}%`);
      }
      agg.line(buf);
      const r = agg.result(since === "all" ? undefined : addDays(localToday(), -Number(since)));
      setProgress("Uploading daily totals…");
      const res = await api.post<{ steps: number; sleep: number; restingHr: number }>("/api/integrations/apple-health", {
        steps: cats.includes("steps") ? r.steps.slice(-5000) : [],
        sleep: cats.includes("sleep") ? r.sleep.slice(-5000) : [],
        restingHr: cats.includes("heart_rate") ? r.restingHr.slice(-5000) : [],
      });
      toast({ tone: "success", text: `Imported ${res.steps} days of steps, ${res.sleep} nights of sleep, ${res.restingHr} heart-rate days` });
      onDone();
    } catch (e) {
      toast({ tone: "error", text: e instanceof Error && !("status" in e) ? "We couldn't read that file. Make sure it's export.xml from the Health app (unzip export.zip first)." : errorMessage(e) });
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Data you allow us to import">
        <Chips label="Categories" options={p.categories.map((c) => ({ value: c, label: CAT_LABELS[c] ?? c }))} value={cats} onChange={setCats} />
      </Field>
      <Field label="How far back" htmlFor="since">
        <Select id="since" value={since} onChange={(e) => setSince(e.target.value)}>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
          <option value="all">Everything</option>
        </Select>
      </Field>
      <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="sr-only" aria-label="Apple Health export.xml" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
      <Button onClick={() => fileRef.current?.click()} disabled={!!progress} icon={<FileUp className="size-4" />}>
        Choose export.xml
      </Button>
      {progress && <Spinner label={progress} />}
      <p className="text-xs text-muted">On iPhone: Health → your profile → Export All Health Data, then unzip and choose <code>export.xml</code>. The file is read in your browser; only daily totals are uploaded. Re-importing updates days instead of duplicating them.</p>
    </div>
  );
}

function GpxImport({ onDone }: { onDone: () => void }) {
  const { toast } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(files: FileList) {
    setBusy(true);
    let ok = 0;
    let dup = 0;
    for (const f of Array.from(files).slice(0, 20)) {
      try {
        if (f.size > 15_000_000) throw new Error("too large");
        const r = await api.post<{ duplicate: boolean }>("/api/integrations/gpx", { gpx: await f.text(), type: type || undefined });
        if (r.duplicate) dup++;
        else ok++;
      } catch (e) {
        toast({ tone: "error", text: `${f.name}: ${errorMessage(e)}` });
      }
    }
    if (ok || dup) toast({ tone: "success", text: `Imported ${ok} activit${ok === 1 ? "y" : "ies"}${dup ? ` (${dup} already imported)` : ""}` });
    setBusy(false);
    onDone();
  }
  return (
    <div className="space-y-3">
      <Field label="Activity type" htmlFor="gt" hint="Leave on auto-detect to use the type stored in the file.">
        <Select id="gt" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Auto-detect</option>
          {Object.entries(SPORTS)
            .filter(([, s]) => s.gps)
            .map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
        </Select>
      </Field>
      <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml" multiple className="sr-only" aria-label="GPX files" onChange={(e) => e.target.files?.length && run(e.target.files)} />
      <Button onClick={() => fileRef.current?.click()} loading={busy} icon={<FileUp className="size-4" />}>
        Choose GPX files
      </Button>
    </div>
  );
}

export default function DevicesPage() {
  const { toast, confirm } = useFeedback();
  const { data, error, isLoading, mutate } = useSWR<Integration[]>("/api/integrations");
  if (isLoading) return <LoadingCards />;
  if (error || !data) return <ErrorState error={error} onRetry={() => mutate()} />;

  async function disconnect(p: Integration) {
    if (!(await confirm({ title: `Disconnect ${p.name}?`, body: "No more data will be imported from it.", confirmLabel: "Disconnect" }))) return;
    const deleteImported = await confirm({
      title: "Also delete imported data?",
      body: `Delete the ${p.importedRecords} record(s) imported through ${p.name}? Choose Cancel to keep them. Data you entered yourself is never affected.`,
      confirmLabel: "Delete imported data",
      danger: true,
    });
    try {
      await mutate(await api.del<Integration[]>("/api/integrations", { provider: p.key, deleteImported }), false);
      toast({ tone: "success", text: deleteImported ? "Disconnected and imported data deleted" : "Disconnected" });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Devices & imports" subtitle="You choose exactly what's shared" back="/settings" />
      <Alert tone="info">This web version can import files from your phone or watch. Live syncing with Apple Health or Health Connect requires a native mobile app, which isn&apos;t part of this build — we won&apos;t pretend otherwise.</Alert>
      {data.map((p) => (
        <Card key={p.key} className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">{p.name}</h2>
              <p className="text-sm text-muted">{p.description}</p>
            </div>
            {p.status === "available" ? (
              p.connected ? <Badge tone="success">Connected</Badge> : <Badge tone="primary">Available</Badge>
            ) : p.status === "requires_native_app" ? (
              <Badge>Needs mobile app</Badge>
            ) : (
              <Badge tone="warning">Needs setup by admin</Badge>
            )}
          </div>
          {p.status === "available" && (
            <>
              {p.key === "apple_health_import" ? <AppleImport p={p} onDone={() => mutate()} /> : <GpxImport onDone={() => mutate()} />}
              {(p.connected || p.importedRecords > 0) && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted">
                  <span>
                    {p.importedRecords} imported record{p.importedRecords === 1 ? "" : "s"}
                    {p.lastSyncAt ? ` · last import ${new Date(p.lastSyncAt).toLocaleString()}` : ""}
                    {p.allowedCategories.length ? ` · sharing: ${p.allowedCategories.map((c) => CAT_LABELS[c] ?? c).join(", ")}` : ""}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => disconnect(p)} icon={<Unplug className="size-4" />}>
                    Disconnect
                  </Button>
                </div>
              )}
            </>
          )}
          {p.status !== "available" && <p className="text-xs text-muted">Would provide: {p.categories.map((c) => CAT_LABELS[c] ?? c).join(", ")}.</p>}
        </Card>
      ))}
    </div>
  );
}
