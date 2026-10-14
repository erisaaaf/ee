"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { AI_DATA_CATEGORIES } from "@/lib/validation";
import type { AiStatus, Integration, InventoryItem } from "@/lib/client-types";
import { useMe, type Me } from "@/components/me";
import { clearOfflineData } from "@/components/offline";
import { Alert, Badge, Button, Card, Chips, Field, Input, PageHeader, SectionTitle, Sheet, Spinner, Toggle, useFeedback } from "@/components/ui";

export default function PrivacyDashboard() {
  const { me, mutate } = useMe();
  const { toast, confirm } = useFeedback();
  const { data: inventory, mutate: mutateInv } = useSWR<InventoryItem[]>("/api/account/data");
  const { data: devices } = useSWR<Integration[]>("/api/integrations");
  const { data: ai } = useSWR<AiStatus>("/api/ai/status");
  const s = me.settings;
  const [deleting, setDeleting] = useState(false);
  const [pw, setPw] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  async function setting(body: Partial<Me["settings"]>) {
    try {
      await mutate(await api.patch<Me>("/api/me/settings", body), false);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }
  async function deleteCategory(item: InventoryItem) {
    if (!(await confirm({ title: `Delete all ${item.label.toLowerCase()} data?`, body: `${item.records} record(s) will be permanently deleted: ${item.what} This can't be undone.`, confirmLabel: "Delete permanently", danger: true }))) return;
    try {
      await mutateInv(await api.del<InventoryItem[]>("/api/account/data", { category: item.key, confirm: true }), false);
      toast({ tone: "success", text: `${item.label} data deleted` });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }
  async function deleteAccount() {
    setBusy(true);
    try {
      await api.post("/api/account/delete", { password: pw, confirm: "DELETE" });
      clearOfflineData();
      window.location.href = "/register";
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
      setBusy(false);
    }
  }

  const connected = devices?.filter((d) => d.connected) ?? [];
  return (
    <div className="space-y-4">
      <PageHeader title="Privacy & data" subtitle="See, control, export and delete your data" back="/settings" />

      <Card className="space-y-2">
        <SectionTitle>AI</SectionTitle>
        {ai && !ai.configured && <Alert tone="info">AI isn&apos;t configured on this server, so no data is currently sent to an AI provider.</Alert>}
        <Toggle label="Use AI features" description="Coach, photo analysis, meal plans, insights. Off = nothing is sent to the AI provider." checked={s.aiEnabled} onChange={(v) => setting({ aiEnabled: v })} />
        <Field label="What the AI may read" hint="Only the data needed for each request is shared, as a summary — never your whole account. Photos you analyse aren't stored.">
          <Chips label="AI data access" options={AI_DATA_CATEGORIES.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))} value={s.aiDataAccess} onChange={(v) => setting({ aiDataAccess: v })} />
        </Field>
        <Toggle label="Save AI conversations" description="Stored encrypted so you can revisit them. Turning this off keeps chats only in this browser tab." checked={s.aiSaveConversations} onChange={(v) => setting({ aiSaveConversations: v })} />
        <Toggle label="Daily AI insight" checked={s.dailyInsight} onChange={(v) => setting({ dailyInsight: v })} />
        <Toggle label="Weekly AI review" checked={s.weeklyReview} onChange={(v) => setting({ weeklyReview: v })} />
        {ai?.configured && <p className="text-xs text-muted">Provider: Anthropic ({ai.model}). Used this hour: {ai.quota.used} of {ai.quota.limit} requests.</p>}
      </Card>

      <Card>
        <SectionTitle>What we store</SectionTitle>
        {!inventory ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-border">
            {inventory.map((i) => (
              <li key={i.key} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {i.label} <span className="text-xs font-normal text-muted">· {i.records} record{i.records === 1 ? "" : "s"}</span>
                  </p>
                  <p className="text-xs text-muted">{i.what}</p>
                  <p className="text-xs text-muted">Why: {i.why}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteCategory(i)} disabled={i.records === 0} aria-label={`Delete all ${i.label} data`} icon={<Trash2 className="size-4" />}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-2">
        <SectionTitle>Connected devices</SectionTitle>
        {connected.length === 0 ? (
          <p className="text-sm text-muted">No integrations connected.</p>
        ) : (
          connected.map((d) => (
            <p key={d.key} className="text-sm">
              {d.name} <Badge tone="success">sharing {d.allowedCategories.join(", ") || "nothing"}</Badge>
            </p>
          ))
        )}
        <Link href="/settings/devices" className="text-sm text-primary hover:underline">
          Manage devices
        </Link>
      </Card>

      <Card className="space-y-2">
        <SectionTitle>Account security</SectionTitle>
        <p className="text-sm text-muted">Two-factor authentication is {me.totpEnabled ? "on" : "off"}.</p>
        <Link href="/settings/security" className="text-sm text-primary hover:underline">
          Password, two-factor & signed-in devices
        </Link>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Export</SectionTitle>
        <p className="text-sm text-muted">Download everything we hold about you as a JSON file (encrypted notes and chats are decrypted for you; passwords and secrets are never included).</p>
        <a href="/api/account/export" download className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2">
          <Download className="size-4" aria-hidden /> Download my data
        </a>
      </Card>

      <Card className="space-y-3 border-danger/40">
        <SectionTitle>Delete account</SectionTitle>
        <p className="text-sm text-muted">Permanently deletes your account and every record linked to it — diary, workouts, sleep, wellbeing, AI chats, imports and security logs. This can&apos;t be undone.</p>
        <Button variant="danger" onClick={() => setDeleting(true)}>
          Delete my account…
        </Button>
      </Card>
      <Sheet
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete account permanently"
        footer={
          <Button variant="danger" onClick={deleteAccount} loading={busy} disabled={typed !== "DELETE" || !pw}>
            Delete everything
          </Button>
        }
      >
        <div className="space-y-4">
          <Alert tone="danger">Consider downloading your data first. After deletion, nothing can be recovered.</Alert>
          <Field label="Your password" htmlFor="dpw">
            <Input id="dpw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label='Type "DELETE" to confirm' htmlFor="dty">
            <Input id="dty" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
