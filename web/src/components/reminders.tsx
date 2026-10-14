"use client";

import { useEffect } from "react";
import { useMe } from "./me";

export const REMINDER_TEXT: Record<string, { label: string; body: string; href: string }> = {
  water: { label: "Drink water", body: "A glass of water now? 💧", href: "/hydration" },
  workout: { label: "Workout", body: "Time for today's workout — even a short one counts.", href: "/workout" },
  log_meal: { label: "Log a meal", body: "Want to log what you ate?", href: "/nutrition" },
  prepare_meal: { label: "Prepare a meal", body: "Good time to prep your next meal.", href: "/nutrition/plans" },
  sleep: { label: "Wind down for sleep", body: "Your usual bedtime is coming up. 🌙", href: "/wellbeing" },
  review_progress: { label: "Review progress", body: "Take a look at how your week is going.", href: "/progress" },
  challenge: { label: "Challenge check-in", body: "How's your challenge going?", href: "/progress/rewards" },
};

/**
 * Shows due reminders using the browser Notification API while the app is open (tab or installed PWA).
 * Background push while the app is closed would need a Web Push server (VAPID keys) — not configured in this build.
 */
export function ReminderScheduler() {
  const { me } = useMe();
  useEffect(() => {
    if (!me.settings.notifications || typeof Notification === "undefined") return;
    const check = () => {
      if (Notification.permission !== "granted") return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const day = now.toISOString().slice(0, 10);
      for (const r of me.settings.reminders) {
        if (!r.enabled || r.time !== hhmm) continue;
        const key = `vt_rem_${r.type}_${r.time}_${day}`;
        try {
          if (localStorage.getItem(key)) continue;
          localStorage.setItem(key, "1");
        } catch {
          /* storage unavailable */
        }
        const t = REMINDER_TEXT[r.type];
        if (!t) continue;
        const n = new Notification(`Vitality · ${t.label}`, { body: t.body, tag: `vt-${r.type}`, icon: "/icon.svg" });
        n.onclick = () => {
          window.focus();
          window.location.href = t.href;
        };
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [me.settings.notifications, me.settings.reminders]);
  return null;
}
