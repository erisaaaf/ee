"use client";

import Link from "next/link";
import useSWR from "swr";
import { api, errorMessage } from "@/lib/api";
import type { Challenge, Rewards } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { Alert, Badge, Button, Card, cx, ErrorState, LoadingCards, PageHeader, ProgressBar, SectionTitle, useFeedback } from "@/components/ui";

export default function RewardsPage() {
  const { me } = useMe();
  const { toast, confirm } = useFeedback();
  const { data, error, isLoading, mutate } = useSWR<Rewards>(me.settings.gamification ? "/api/rewards" : null);
  const { data: challenges, mutate: mutateCh } = useSWR<Challenge[]>(me.settings.gamification ? "/api/challenges" : null);

  if (!me.settings.gamification)
    return (
      <>
        <PageHeader title="Rewards" back="/progress" />
        <Alert tone="info" title="Challenges and rewards are turned off">
          You can switch them back on in <Link href="/settings/preferences">Settings</Link>. Your goals and progress charts still work.
        </Alert>
      </>
    );
  if (isLoading) return <LoadingCards />;
  if (error || !data) return <ErrorState error={error} onRetry={() => mutate()} />;

  async function join(key: string) {
    try {
      await mutateCh(await api.post<Challenge[]>("/api/challenges", { key }), false);
      toast({ tone: "success", text: "Challenge started. Have fun with it!" });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }
  async function leave(c: Challenge) {
    if (!("id" in c) || !c.id) return;
    if (!(await confirm({ title: `Leave “${c.title}”?`, body: "No problem — you can start it again any time." }))) return;
    try {
      await api.del(`/api/challenges/${c.id}`);
      mutateCh();
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    }
  }
  const s = data.streaks;
  return (
    <div className="space-y-4">
      <PageHeader title="Rewards" subtitle="Earned only from what you've actually done" back="/progress" />
      <Card>
        <div className="flex items-center gap-4">
          <div className="flex size-16 flex-col items-center justify-center rounded-2xl bg-primary text-on-primary">
            <span className="text-[10px] uppercase">Level</span>
            <span className="text-2xl font-bold">{data.level.level}</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{data.level.xp.toLocaleString()} XP</p>
            <ProgressBar value={data.level.intoLevel} max={data.level.levelSize} label="Progress to next level" className="mt-1" />
            <p className="mt-1 text-xs text-muted">XP comes from active days, workouts, activities, recipes and achievements.</p>
          </div>
        </div>
      </Card>
      <Card>
        <SectionTitle>Streaks</SectionTitle>
        <ul className="grid grid-cols-2 gap-2 text-sm">
          {[
            ["Logging", `${s.logging.days} days`, s.logging.flexUsed],
            ["Meals logged", `${s.meals.days} days`, s.meals.flexUsed],
            ["Hydration target", `${s.hydration.days} days`, s.hydration.flexUsed],
            ["Active days", `${s.activity.days} days`, s.activity.flexUsed],
            ["Workout weeks", `${s.workoutWeeks} weeks`, 0],
          ].map(([label, val, flex]) => (
            <li key={String(label)} className="rounded-xl bg-surface-2/60 p-3">
              <p className="text-xs text-muted">{label}</p>
              <p className="font-semibold">🔥 {val}</p>
              {Number(flex) > 0 && <p className="text-xs text-muted">{flex} flex day{flex === 1 ? "" : "s"} used</p>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Streaks are flexible: missing one day a week doesn&apos;t reset them, and getting back to it the next day keeps your streak going. Workout streaks count weeks, because rest days matter.</p>
      </Card>
      <Card>
        <SectionTitle>Challenges</SectionTitle>
        <ul className="space-y-3">
          {challenges?.map((c) => (
            <li key={c.key} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted">{c.description}</p>
                </div>
                {c.joined ? (
                  c.status === "completed" ? (
                    <Badge tone="success">Completed 🎉</Badge>
                  ) : c.ended ? (
                    <Badge>Ended</Badge>
                  ) : (
                    <Badge tone="primary">{c.daysLeft} days left</Badge>
                  )
                ) : (
                  <Button size="sm" variant="soft" onClick={() => join(c.key)}>
                    Join
                  </Button>
                )}
              </div>
              {c.joined && (
                <>
                  <ProgressBar value={c.progress} max={c.required} label={c.title} className="mt-2" color={c.status === "completed" ? "var(--success)" : "var(--primary)"} />
                  <div className="mt-1 flex justify-between text-xs text-muted">
                    <span>
                      {c.progress} / {c.required}
                    </span>
                    {(c.status === "completed" || c.ended) ? (
                      <button className="underline" onClick={() => join(c.key)}>
                        Start again
                      </button>
                    ) : (
                      <button className="underline" onClick={() => leave(c)}>
                        Leave
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <SectionTitle>Achievements</SectionTitle>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.achievements.map((a) => (
            <li key={a.key} className={cx("rounded-xl border p-3 text-center", a.earnedAt ? "border-primary/40 bg-primary-soft/40" : "border-border opacity-60")}>
              <p className="text-2xl" aria-hidden>
                {a.earnedAt ? a.icon : "🔒"}
              </p>
              <p className="text-sm font-medium">{a.title}</p>
              <p className="text-xs text-muted">{a.earnedAt ? `Earned ${new Date(a.earnedAt).toLocaleDateString()}` : a.description}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
