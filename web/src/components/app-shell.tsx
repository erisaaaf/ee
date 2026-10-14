"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, type ReactNode } from "react";
import { Dumbbell, Home, LineChart, Search, Settings, Sparkles, Utensils, WifiOff } from "lucide-react";
import { MeProvider, useMe, useMeQuery } from "./me";
import { Button, cx, ErrorState, Skeleton, useFeedback } from "./ui";
import { onAchievements } from "@/lib/api";
import { OfflineSync, useOnline } from "./offline";
import { ReminderScheduler } from "./reminders";

const NAV = [
  { href: "/", key: "nav.home", icon: Home, match: (p: string) => p === "/" || p.startsWith("/hydration") || p.startsWith("/wellbeing") },
  { href: "/nutrition", key: "nav.nutrition", icon: Utensils, match: (p: string) => p.startsWith("/nutrition") },
  { href: "/workout", key: "nav.workout", icon: Dumbbell, match: (p: string) => p.startsWith("/workout") || p.startsWith("/activity") },
  { href: "/progress", key: "nav.progress", icon: LineChart, match: (p: string) => p.startsWith("/progress") },
  { href: "/coach", key: "nav.coach", icon: Sparkles, match: (p: string) => p.startsWith("/coach") },
] as const;

function Nav() {
  const pathname = usePathname();
  const { t } = useMe();
  return (
    <>
      {/* Desktop sidebar */}
      <nav aria-label="Main" className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-3 text-lg font-semibold">
          <span className="inline-flex size-8 items-center justify-center rounded-xl bg-primary text-on-primary" aria-hidden>
            V
          </span>
          Vitality
        </Link>
        <ul className="space-y-1">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium", active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-text")}
                >
                  <n.icon className="size-5" aria-hidden />
                  {t(n.key)}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto space-y-1">
          <Link href="/search" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text">
            <Search className="size-5" aria-hidden /> {t("nav.search")}
          </Link>
          <Link
            href="/settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={cx("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium", pathname.startsWith("/settings") ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-text")}
          >
            <Settings className="size-5" aria-hidden /> {t("nav.settings")}
          </Link>
        </div>
      </nav>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-2 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-sm text-on-primary" aria-hidden>
            V
          </span>
          Vitality
        </Link>
        <div className="flex items-center">
          <Link href="/search" aria-label={t("nav.search")} className="inline-flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
            <Search className="size-5" />
          </Link>
          <Link href="/settings" aria-label={t("nav.settings")} className="inline-flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
            <Settings className="size-5" />
          </Link>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined} className={cx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-primary" : "text-muted")}>
                  <n.icon className="size-5" aria-hidden />
                  {t(n.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function AchievementListener() {
  const { toast } = useFeedback();
  const { me } = useMe();
  useEffect(
    () =>
      onAchievements((list) => {
        if (!me.settings.gamification) return;
        for (const a of list) toast({ tone: "success", text: `${a.icon} Achievement unlocked: ${a.title}` });
      }),
    [toast, me.settings.gamification],
  );
  return null;
}

function SyncToasts() {
  const { toast } = useFeedback();
  const onSynced = useCallback(
    (r: { sent: number; failed: number }) => {
      if (r.sent) toast({ tone: "success", text: `Synced ${r.sent} item${r.sent === 1 ? "" : "s"} saved while offline.` });
      if (r.failed) toast({ tone: "error", text: `${r.failed} offline item${r.failed === 1 ? "" : "s"} couldn't be saved.` });
    },
    [toast],
  );
  return <OfflineSync onSynced={onSynced} />;
}

function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-sm text-warning">
      <WifiOff className="size-4" aria-hidden /> You&apos;re offline. You can still log water, workouts and saved foods — they&apos;ll sync when you reconnect.
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, error, mutate, isLoading } = useMeQuery();
  const pathname = usePathname();
  const router = useRouter();
  const onboarding = pathname.startsWith("/onboarding");

  useEffect(() => {
    if (me && !me.profile.onboardingComplete && !onboarding) router.replace("/onboarding");
  }, [me, onboarding, router]);

  if (isLoading || (!me && !error)) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6" aria-busy>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (error || !me) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState error={error} onRetry={() => mutate()} />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => (window.location.href = "/login")}>
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }
  return (
    <MeProvider me={me} mutate={mutate}>
      <AchievementListener />
      <SyncToasts />
      <ReminderScheduler />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      {!onboarding && <Nav />}
      <div className={cx(!onboarding && "lg:pl-60")}>
        <OfflineBanner />
        <main id="main" className={cx("mx-auto w-full max-w-3xl px-4 pt-5", onboarding ? "pb-10" : "pb-28 lg:pb-10")}>
          {children}
        </main>
      </div>
    </MeProvider>
  );
}
