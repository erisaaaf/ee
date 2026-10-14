import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "../db";
import { decrypt, encrypt } from "../crypto";
import { badRequest, notFound } from "../errors";
import { normalize } from "@/lib/text";
import { AI_BETAS, AI_FALLBACKS, AI_MODEL, REFUSAL_MESSAGE, getClient, guardAi, mapAiError } from "./provider";
import { SAFETY_PROMPT } from "./core";
import { TOOLS, aiAccess, runTool } from "./tools";
import { localNow } from "../services/analytics";
import { addWater } from "../services/wellness";
import { addEntry } from "../services/diary";
import { createRecipe } from "../services/recipes";
import { createTemplate } from "../services/fitness";

const MAX_TOOL_ROUNDS = 8;
const HISTORY_LIMIT = 20;

export const chatSchema = z.object({
  message: z.string().trim().min(1, "Type a message").max(4000),
  conversationId: z.string().nullable().optional(),
  // Only used when the user has turned off conversation saving (history then lives in the browser).
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(HISTORY_LIMIT).optional(),
});

const CHAT_INSTRUCTIONS = `You are chatting inside the app's AI Coach screen.
- Use tools to look up the user's data before answering questions about it; never guess numbers.
- To change data (log water/food, save a recipe or workout) use a propose_* tool. Never claim something was saved — it's saved only after the user taps Confirm.
- Use metric units unless the profile says imperial.
- Keep answers short and skimmable. Use short bullet lists when helpful.`;

type Turn = { role: "user" | "assistant"; content: string };

async function loadHistory(userId: string, conversationId: string): Promise<Turn[]> {
  const conv = await db.aiConversation.findFirst({ where: { id: conversationId, userId } });
  if (!conv) throw notFound("conversation");
  const msgs = await db.aiMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: HISTORY_LIMIT });
  return msgs.reverse().map((m) => ({ role: m.role as Turn["role"], content: decrypt(m.contentEnc) }));
}

export async function chat(userId: string, input: z.infer<typeof chatSchema>) {
  await guardAi(userId, "chat");
  const [settings, access, { today }] = await Promise.all([db.settings.findUnique({ where: { userId } }), aiAccess(userId), localNow(userId)]);
  const save = settings?.aiSaveConversations ?? true;
  const history: Turn[] = input.conversationId && save ? await loadHistory(userId, input.conversationId) : (input.history ?? []);

  const messages: Anthropic.Beta.BetaMessageParam[] = [...history.map((t) => ({ role: t.role, content: t.content })), { role: "user", content: input.message }];
  const ctx = { userId, today, access };
  const toolsUsed: string[] = [];
  const pendingIds: string[] = [];
  let reply = "";
  let refused = false;

  const client = getClient();
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await client.beta.messages.create({
        model: AI_MODEL,
        max_tokens: 8000,
        betas: [...AI_BETAS],
        fallbacks: AI_FALLBACKS,
        output_config: { effort: "medium" },
        system: [
          { type: "text", text: SAFETY_PROMPT },
          { type: "text", text: CHAT_INSTRUCTIONS, cache_control: { type: "ephemeral" } },
          // Volatile context goes after the cache breakpoint.
          { type: "text", text: `Today's date for this user: ${today}. Data categories the user allows you to read: ${[...access].join(", ") || "none"}.` },
        ],
        tools: TOOLS.map((t) => t.tool),
        messages,
      });
      if (res.stop_reason === "refusal") {
        refused = true;
        reply = REFUSAL_MESSAGE;
        break;
      }
      const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || !toolUses.length) {
        reply = text || (res.stop_reason === "max_tokens" ? "Sorry — my answer got cut off. Could you ask a narrower question?" : "");
        break;
      }
      if (round === MAX_TOOL_ROUNDS) {
        reply = text || "I couldn't finish looking that up. Could you try a more specific question?";
        break;
      }
      messages.push({ role: "assistant", content: res.content });
      // Run tool calls in parallel and return all results in one user message.
      const results = await Promise.all(
        toolUses.map(async (tu) => {
          toolsUsed.push(tu.name);
          const out = (await runTool(ctx, tu.name, tu.input)) as { pendingActionId?: string; error?: string };
          if (out && typeof out === "object" && out.pendingActionId) pendingIds.push(out.pendingActionId);
          return { type: "tool_result" as const, tool_use_id: tu.id, content: JSON.stringify(out ?? null).slice(0, 60_000), is_error: Boolean(out && typeof out === "object" && out.error) };
        }),
      );
      messages.push({ role: "user", content: results });
    }
  } catch (err) {
    mapAiError(err);
  }

  if (!reply) reply = "I'm not sure how to help with that. Could you rephrase?";
  const pending = pendingIds.length ? await db.pendingAction.findMany({ where: { id: { in: pendingIds }, userId }, select: { id: true, type: true, summary: true, status: true } }) : [];

  let conversationId: string | null = null;
  if (save) {
    conversationId = input.conversationId ?? null;
    if (!conversationId) {
      const c = await db.aiConversation.create({ data: { userId, title: input.message.slice(0, 60) } });
      conversationId = c.id;
    }
    await db.aiMessage.createMany({
      data: [
        { conversationId, role: "user", contentEnc: encrypt(input.message) },
        { conversationId, role: "assistant", contentEnc: encrypt(reply), meta: { toolsUsed, pendingActionIds: pendingIds, refused } },
      ],
    });
    await db.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  }
  return { conversationId, reply, toolsUsed: [...new Set(toolsUsed)], pendingActions: pending, refused, saved: save };
}

// ── Conversations ──

export async function listConversations(userId: string, q?: string) {
  const convs = await db.aiConversation.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 100 });
  if (!q) return convs.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  // Messages are encrypted at rest, so search decrypts this user's messages in memory.
  const nq = normalize(q);
  const out = [];
  for (const c of convs) {
    if (normalize(c.title).includes(nq)) {
      out.push({ id: c.id, title: c.title, updatedAt: c.updatedAt });
      continue;
    }
    const msgs = await db.aiMessage.findMany({ where: { conversationId: c.id }, select: { contentEnc: true } });
    if (msgs.some((m) => normalize(decrypt(m.contentEnc)).includes(nq))) out.push({ id: c.id, title: c.title, updatedAt: c.updatedAt });
  }
  return out;
}

export async function getConversation(userId: string, id: string) {
  const c = await db.aiConversation.findFirst({ where: { id, userId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!c) throw notFound("conversation");
  const pendingIds = c.messages.flatMap((m) => ((m.meta as { pendingActionIds?: string[] } | null)?.pendingActionIds ?? []));
  const actions = await db.pendingAction.findMany({ where: { id: { in: pendingIds }, userId }, select: { id: true, type: true, summary: true, status: true } });
  return {
    id: c.id,
    title: c.title,
    messages: c.messages.map((m) => {
      const meta = (m.meta as { pendingActionIds?: string[]; toolsUsed?: string[] } | null) ?? {};
      return { id: m.id, role: m.role, content: decrypt(m.contentEnc), createdAt: m.createdAt, toolsUsed: meta.toolsUsed ?? [], pendingActions: actions.filter((a) => meta.pendingActionIds?.includes(a.id)) };
    }),
  };
}

export async function deleteConversation(userId: string, id: string) {
  const { count } = await db.aiConversation.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("conversation");
}

// ── Confirming AI-proposed actions (executed via the same validated services as the UI) ──

export async function resolvePendingAction(userId: string, id: string, decision: "confirm" | "reject") {
  const a = await db.pendingAction.findFirst({ where: { id, userId } });
  if (!a) throw notFound("suggestion");
  if (a.status !== "pending") throw badRequest("This suggestion has already been handled.");
  if (a.expiresAt < new Date()) {
    await db.pendingAction.update({ where: { id }, data: { status: "expired", resolvedAt: new Date() } });
    throw badRequest("This suggestion has expired. Ask the coach again if you still want it.");
  }
  if (decision === "reject") {
    await db.pendingAction.update({ where: { id }, data: { status: "rejected", resolvedAt: new Date() } });
    return { status: "rejected" as const };
  }
  const p = a.payload as Record<string, unknown>;
  let result: unknown;
  switch (a.type) {
    case "log_water":
      result = await addWater(userId, z.object({ amountMl: z.number().int().min(10).max(3000), date: z.string() }).transform((v) => ({ ...v, drink: "water" })).parse(p));
      break;
    case "log_food": {
      const v = z.object({ foodId: z.string(), grams: z.number().positive().max(5000), mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]), date: z.string() }).parse(p);
      result = await addEntry(userId, { kind: "food", ...v, quantity: 1, unitLabel: `${v.grams} g`, source: "ai" });
      break;
    }
    case "create_recipe": {
      const v = z.object({ name: z.string(), servings: z.number(), instructions: z.string(), prepMinutes: z.number().nullable(), ingredients: z.array(z.object({ name: z.string(), grams: z.number(), foodId: z.string().nullable() })) }).parse(p);
      result = await createRecipe(
        userId,
        {
          name: v.name.slice(0, 120),
          servings: Math.min(100, Math.max(1, v.servings)),
          instructions: v.instructions.slice(0, 10000),
          prepMinutes: v.prepMinutes,
          ingredients: v.ingredients.map((i) => ({ name: i.name.slice(0, 120), grams: Math.max(0, Math.min(20000, i.grams)), foodId: i.foodId, quantity: 1, unitLabel: "g" })),
        },
        "ai",
      );
      break;
    }
    case "save_workout": {
      const v = z.object({ name: z.string(), location: z.enum(["home", "gym", "any"]), items: z.array(z.object({ slug: z.string(), sets: z.number(), reps: z.number().nullable(), durationSec: z.number().nullable(), restSec: z.number() })) }).parse(p);
      const exs = await db.exercise.findMany({ where: { slug: { in: v.items.map((i) => i.slug) } } });
      result = await createTemplate(userId, {
        name: v.name.slice(0, 100),
        location: v.location,
        source: "ai",
        scheduledDays: [],
        items: v.items
          .filter((i) => exs.some((e) => e.slug === i.slug))
          .map((i) => ({ exerciseId: exs.find((e) => e.slug === i.slug)!.id, sets: Math.min(6, Math.max(1, Math.round(i.sets))), reps: i.reps, durationSec: i.durationSec, restSec: Math.min(600, Math.max(0, i.restSec)) })),
      });
      break;
    }
    default:
      throw badRequest("Unknown suggestion type.");
  }
  await db.pendingAction.update({ where: { id }, data: { status: "confirmed", resolvedAt: new Date() } });
  return { status: "confirmed" as const, type: a.type, result };
}
