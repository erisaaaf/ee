"use client";

import Link from "next/link";
import { Bell, ChevronRight, Gauge, LayoutGrid, Lock, LogOut, Shield, SlidersHorizontal, User, Watch } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/components/me";
import { clearOfflineData } from "@/components/offline";
import { Button, Card, PageHeader } from "@/components/ui";

const ITEMS = [
  { href: "/settings/profile", label: "Profile & units", desc: "Name, body details, language, units", icon: User },
  { href: "/settings/preferences", label: "Goals & preferences", desc: "Goals, diet, allergies, equipment, schedule", icon: SlidersHorizontal },
  { href: "/settings/targets", label: "Daily targets", desc: "Calories, macros, water, steps, sleep", icon: Gauge },
  { href: "/settings/dashboard", label: "Dashboard & tracking", desc: "What you track and see on Home", icon: LayoutGrid },
  { href: "/settings/notifications", label: "Reminders", desc: "Water, workouts, meals, sleep", icon: Bell },
  { href: "/settings/devices", label: "Devices & imports", desc: "Apple Health export, GPX files, wearables", icon: Watch },
  { href: "/settings/privacy", label: "Privacy & data", desc: "AI access, export, delete data or account", icon: Shield },
  { href: "/settings/security", label: "Security", desc: "Password, two-factor, signed-in devices", icon: Lock },
];

export default function SettingsPage() {
  const { me, t } = useMe();
  async function signOut() {
    await api.post("/api/auth/logout").catch(() => {});
    clearOfflineData();
    window.location.href = "/login";
  }
  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.settings")} subtitle={me.email} />
      <Card className="p-0">
        <ul className="divide-y divide-border">
          {ITEMS.map((i) => (
            <li key={i.href}>
              <Link href={i.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2/60">
                <i.icon className="size-5 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{i.label}</span>
                  <span className="block truncate text-xs text-muted">{i.desc}</span>
                </span>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Button variant="secondary" className="w-full" onClick={signOut} icon={<LogOut className="size-4" />}>
        {t("auth.signOut")}
      </Button>
      <p className="text-center text-xs text-muted">
        Vitality provides general wellness information, not medical advice. <Link href="/privacy-policy" className="underline">How we handle data</Link>
      </p>
    </div>
  );
}
