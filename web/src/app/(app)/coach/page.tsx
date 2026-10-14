"use client";

import Link from "next/link";
import useSWR, { mutate as globalMutate } from "swr";
import { Fragment, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, History, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { api, errorMessage, newClientId } from "@/lib/api";
import type { AiStatus, ChatResult, Conversation } from "@/lib/client-types";
import { useMe } from "@/components/me";
import { Alert, Badge, Button, cx, Input, PageHeader, Sheet, Spinner, Textarea, useFeedback } from "@/components/ui";

type Action = { id: string; type: string; summary: string; status: string };
type Msg = { id: string; role: "user" | "assistant"; content: string; toolsUsed?: string[]; pendingActions?: Action[]; refused?: boolean };

const SUGGESTIONS = [
  "Create today's meals",
  "Create a workout",
  "Analyze my progress",
  "Find a healthy recipe",
  "Adjust my plan",
  "Explain my nutrition",
  "Help me plan my week",
  "I only have 30 minutes and no dumbbells",
];

const TOOL_LABELS: Record<string, string> = {
  get_profile_context: "your preferences",
  get_nutrition_day: "your food diary",
  get_trends: "your trends",
  get_week_review_data: "this week's summary",
  get_workout_history: "your workouts",
  get_activities: "your activities",
  get_sleep_and_wellbeing: "your sleep & wellbeing",
  get_hydration: "your hydration",
  get_goals: "your goals",
  search_foods: "the food database",
  find_exercise_alternatives: "the exercise library",
  generate_workout: "the workout generator",
};

/** Minimal, safe markdown: paragraphs, bullet lists, **bold**. No HTML injection. */
function RichText({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`l${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (m) list.push(m[1]);
    else {
      flush();
      if (line.trim().startsWith("#")) blocks.push(<p key={`h${blocks.length}`} className="mt-2 font-semibold">{inline(line.replace(/^#+\s*/, ""))}</p>);
      else if (line.trim()) blocks.push(<p key={`p${blocks.length}`} className="my-1">{inline(line)}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

function ActionCard({ a, onResolved }: { a: Action; onResolved: (status: string) => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  async function resolve(decision: "confirm" | "reject") {
    setBusy(decision);
    try {
      await api.post(`/api/ai/actions/${a.id}`, { decision });
      onResolved(decision === "confirm" ? "confirmed" : "rejected");
      if (decision === "confirm") {
        toast({ tone: "success", text: "Done — saved." });
        globalMutate((k) => typeof k === "string" && (k.startsWith("/api/dashboard") || k.startsWith("/api/diary") || k.startsWith("/api/water") || k.startsWith("/api/recipes") || k.startsWith("/api/workouts")));
      }
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mt-2 rounded-xl border border-primary/40 bg-surface p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Suggested change</p>
      <p className="text-sm font-medium">{a.summary}</p>
      {a.status === "pending" ? (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => resolve("confirm")} loading={busy === "confirm"} icon={<Check className="size-4" />}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => resolve("reject")} loading={busy === "reject"} icon={<X className="size-4" />}>
            No thanks
          </Button>
        </div>
      ) : (
        <Badge tone={a.status === "confirmed" ? "success" : "neutral"} className="mt-2">
          {a.status === "confirmed" ? "Saved" : a.status === "rejected" ? "Declined" : "Expired"}
        </Badge>
      )}
    </div>
  );
}

function Coach() {
  const { me } = useMe();
  const params = useSearchParams();
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const { data: status } = useSWR<AiStatus>("/api/ai/status");
  const [conversationId, setConversationId] = useState<string | null>(params.get("c"));
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(params.get("q") ?? "");
  const [sending, setSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: convs, mutate: mutateConvs } = useSWR<{ id: string; title: string; updatedAt: string }[]>(historyOpen ? `/api/ai/conversations${search ? `?q=${encodeURIComponent(search)}` : ""}` : null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) return;
    api
      .get<Conversation>(`/api/ai/conversations/${conversationId}`)
      .then((c) => setMessages(c.messages.map((m) => ({ id: m.id, role: m.role as Msg["role"], content: m.content ?? "", toolsUsed: m.toolsUsed, pendingActions: m.pendingActions }))))
      .catch(() => setConversationId(null));
  }, [conversationId]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages.length, sending]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending) return;
    setInput("");
    const userMsg: Msg = { id: `u-${newClientId()}`, role: "user", content: msg };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      const history = me.settings.aiSaveConversations ? undefined : messages.slice(-20).map(({ role, content }) => ({ role, content }));
      const r = await api.post<ChatResult>("/api/ai/chat", { message: msg, conversationId, history });
      if (r.conversationId && r.conversationId !== conversationId) {
        setConversationId(r.conversationId);
        router.replace(`/coach?c=${r.conversationId}`);
      }
      setMessages((m) => [...m, { id: `a-${newClientId()}`, role: "assistant", content: r.reply, toolsUsed: r.toolsUsed, pendingActions: r.pendingActions, refused: r.refused }]);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== userMsg.id));
      setInput(msg);
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setSending(false);
    }
  }
  function newChat() {
    setConversationId(null);
    setMessages([]);
    router.replace("/coach");
  }

  const unavailable = status && (!status.configured || !status.enabledByUser);
  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col">
      <PageHeader
        title="AI Coach"
        subtitle="Personal guidance from your own data — general wellness information, not medical advice"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} icon={<History className="size-4" />}>
              History
            </Button>
            <Button size="sm" variant="secondary" onClick={newChat} icon={<Plus className="size-4" />}>
              New
            </Button>
          </>
        }
      />
      {status && !status.configured && (
        <Alert tone="warning" title="The AI coach isn't set up on this server">
          An administrator needs to add an Anthropic API key (<code>ANTHROPIC_API_KEY</code>). Until then, everything else works — the workout generator, food database swaps and charts don&apos;t need AI.
        </Alert>
      )}
      {status?.configured && !status.enabledByUser && (
        <Alert tone="info" title="AI is turned off">
          Turn it back on in <Link href="/settings/privacy">Privacy settings</Link>.
        </Alert>
      )}

      <div className="flex-1 space-y-4 py-2" aria-live="polite">
        {messages.length === 0 && !unavailable && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" aria-hidden />
              <p className="font-medium">What can I help with?</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="min-h-10 rounded-full border border-border bg-surface px-4 text-sm hover:bg-surface-2">
                  {s}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              The coach can read: {me.settings.aiDataAccess.join(", ") || "nothing yet"}. <Link href="/settings/privacy" className="underline">Change what it can see</Link>.{" "}
              {me.settings.aiSaveConversations ? "Conversations are saved (encrypted)." : "Conversations are not saved."}
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed", m.role === "user" ? "bg-primary text-on-primary" : "border border-border bg-surface")}>
              {m.role === "assistant" ? <RichText text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
              {m.role === "assistant" && (
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted">
                  <Badge tone="primary">AI</Badge>
                  {m.toolsUsed && m.toolsUsed.filter((t) => TOOL_LABELS[t]).length > 0 && <span>Looked at {[...new Set(m.toolsUsed.map((t) => TOOL_LABELS[t]).filter(Boolean))].join(", ")}</span>}
                </div>
              )}
              {m.pendingActions?.map((a) => (
                <ActionCard key={a.id} a={a} onResolved={(st) => setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, pendingActions: x.pendingActions?.map((p) => (p.id === a.id ? { ...p, status: st } : p)) } : x)))} />
              ))}
            </div>
          </div>
        ))}
        {sending && <Spinner label="Thinking…" />}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-20 flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 lg:bottom-4"
      >
        <Textarea
          aria-label="Message the coach"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={unavailable ? "AI is unavailable" : "Ask anything about food, training, sleep…"}
          disabled={!!unavailable}
          className="max-h-40 min-h-11 resize-none border-0 focus:ring-0"
          maxLength={4000}
        />
        <Button type="submit" aria-label="Send" disabled={!input.trim() || sending || !!unavailable} loading={sending}>
          <Send className="size-4" />
        </Button>
      </form>

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Conversations">
        <div className="space-y-3">
          <Input type="search" aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} />
          {!convs ? (
            <Spinner />
          ) : convs.length === 0 ? (
            <p className="text-sm text-muted">{me.settings.aiSaveConversations ? "No saved conversations." : "Conversation saving is off."}</p>
          ) : (
            <ul className="divide-y divide-border">
              {convs.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <button
                    className="min-w-0 flex-1 py-3 text-left"
                    onClick={() => {
                      setConversationId(c.id);
                      router.replace(`/coach?c=${c.id}`);
                      setHistoryOpen(false);
                    }}
                  >
                    <span className="block truncate text-sm font-medium">{c.title}</span>
                    <span className="text-xs text-muted">{new Date(c.updatedAt).toLocaleString()}</span>
                  </button>
                  <button
                    aria-label={`Delete conversation ${c.title}`}
                    onClick={async () => {
                      if (!(await confirm({ title: "Delete this conversation?", confirmLabel: "Delete", danger: true }))) return;
                      await api.del(`/api/ai/conversations/${c.id}`).catch(() => {});
                      if (c.id === conversationId) newChat();
                      mutateConvs();
                    }}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </div>
  );
}

export default function CoachPage() {
  return (
    <Suspense>
      <Coach />
    </Suspense>
  );
}
