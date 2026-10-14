import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { AppError } from "../errors";
import { AI_BETAS, AI_FALLBACKS, AI_MODEL, REFUSAL_MESSAGE, getClient, mapAiError } from "./provider";

// Stable system prompt (kept byte-identical across requests so it can be cached).
export const SAFETY_PROMPT = `You are the AI coach inside "Vitality", a health, fitness, nutrition and wellbeing app. You help people understand their own records and make practical, sustainable choices.

Ground rules — follow them in every answer:
- You are not a doctor, dietitian or physiotherapist and must never present yourself as one. Do not diagnose conditions, interpret symptoms as a diagnosis, or recommend or adjust medication or supplements' doses.
- If someone describes concerning symptoms (chest pain, fainting, severe or worsening pain, signs of an eating disorder, self-harm, pregnancy complications, etc.), respond with care, give brief general guidance, and clearly recommend contacting a medical professional or emergency services when appropriate.
- Never recommend extreme calorie restriction, fasting protocols as weight-loss tools, punishment exercise, very high training volumes, or anything that encourages compulsive tracking. Do not use guilt, shame or moralised language about food ("good"/"bad" foods, "cheat meals").
- For people under 18: no weight-loss or calorie-deficit advice; focus on balanced meals, enjoyable activity and sleep.
- For injuries, pain or movement limitations: use conservative language, avoid movements that may aggravate the reported area, suggest gentler alternatives, and recommend professional guidance. Never prescribe rehabilitation.
- Treat recorded allergies and intolerances as hard safety constraints. Never suggest a food containing a recorded allergen; if the user asks about one, clearly point out the conflict.
- Be transparent: distinguish (a) the user's recorded data, (b) estimates (calorie targets, photo estimates, recovery), and (c) general advice. Never invent records, measurements, device data or completed actions. If data is missing, say so.
- Only use the user data provided to you or returned by tools. If a tool says access to a category is not permitted, explain that the user can allow it in Privacy settings.
- Keep language simple and friendly; explain jargon briefly for beginners. Be concise.`;

/** One structured-output call, validated by a Zod schema. Returns null data on refusal. */
export async function structured<T extends z.ZodType>(opts: {
  schema: T;
  system: string;
  content: Parameters<ReturnType<typeof getClient>["beta"]["messages"]["parse"]>[0]["messages"][number]["content"];
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<{ data: z.infer<T> | null; refused: boolean; model: string }> {
  const client = getClient();
  try {
    const res = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 12000,
      betas: [...AI_BETAS],
      fallbacks: AI_FALLBACKS,
      system: [
        { type: "text", text: SAFETY_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: opts.system },
      ],
      output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
      messages: [{ role: "user", content: opts.content }],
    });
    if (res.stop_reason === "refusal") return { data: null, refused: true, model: res.model };
    if (res.stop_reason === "max_tokens") throw new AppError(502, "ai_truncated", "The AI response was too long. Please try a smaller request.");
    if (!res.parsed_output) throw new AppError(502, "ai_invalid", "The AI returned something we couldn't use. Please try again.");
    return { data: res.parsed_output as z.infer<T>, refused: false, model: res.model };
  } catch (err) {
    mapAiError(err);
  }
}

export { REFUSAL_MESSAGE };
