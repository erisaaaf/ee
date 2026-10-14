"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { REMINDER_TYPES } from "@/lib/validation";
import { useMe, type Me } from "@/components/me";
import { REMINDER_TEXT } from "@/components/reminders";
import { Alert, Button, Card, Input, PageHeader, SectionTitle, Toggle, useFeedback } from "@/components/ui";

const DEFAULT_TIMES: Record<string, string> = { water: "11:00", workout: "18:00", log_meal: "20:00", prepare_meal: "17:30", sleep: "22:30", review_progress: "19:00", challenge: "12:00" };

export default function NotificationSettings() {
  const { me, mutate } = useMe();
  const { toast } = useFeedback();
  const [enabled, setEnabled] = useState(me.settings.notifications);
  const [list, setList] = useState(() =>
    REMINDER_TYPES.map((type) => me.settings.reminders.find((r) => r.type === type) ?? { type, time: DEFAULT_TIMES[type], enabled: false }),
  );
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      let p = perm;
      if (enabled && typeof Notification !== "undefined" && Notification.permission === "default") {
        p = await Notification.requestPermission();
        setPerm(p);
      }
      const updated = await api.patch<Me>("/api/me/settings", { notifications: enabled, reminders: list });
      await mutate(updated, false);
      toast({ tone: "success", text: enabled && p !== "granted" ? "Saved — but notifications are blocked in your browser." : "Reminders saved" });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Reminders" back="/settings" />
      <Card className="space-y-2">
        <Toggle label="Enable reminders" description="Turn off to disable every reminder at once." checked={enabled} onChange={setEnabled} />
        {perm === "denied" && <Alert tone="warning">Notifications are blocked for this site in your browser settings. Allow them there to receive reminders.</Alert>}
        {perm === "unsupported" && <Alert tone="warning">This browser doesn&apos;t support notifications.</Alert>}
        <Alert tone="info">Reminders appear while Vitality is open in a tab or installed as an app. Reminders when the app is fully closed need push notifications, which aren&apos;t set up on this server yet.</Alert>
      </Card>
      <Card>
        <SectionTitle>Which reminders</SectionTitle>
        <ul className="divide-y divide-border">
          {list.map((r, i) => (
            <li key={r.type} className="flex items-center gap-3 py-2">
              <div className="flex-1">
                <Toggle label={REMINDER_TEXT[r.type].label} checked={r.enabled} disabled={!enabled} onChange={(v) => setList((xs) => xs.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} />
              </div>
              <Input type="time" aria-label={`${REMINDER_TEXT[r.type].label} time`} value={r.time} disabled={!enabled || !r.enabled} onChange={(e) => setList((xs) => xs.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} className="w-28" />
            </li>
          ))}
        </ul>
      </Card>
      <Button size="lg" className="w-full" onClick={save} loading={busy}>
        Save reminders
      </Button>
    </div>
  );
}
