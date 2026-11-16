import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { e2eEnabled } from "@/lib/e2e";
import { AI_MODEL, anthropic } from "./config";
import type { ExtractionInput } from "./extract";

/** A Company Details question the document might answer. */
export type ProfileQuestion = { key: string; section: string; label: string; kind: string; options?: readonly string[] };

const outputSchema = z.object({
  answers: z.array(z.object({ key: z.string(), value: z.string(), quote: z.string() })),
});
export type ProfileAnswer = z.infer<typeof outputSchema>["answers"][number];

const SYSTEM = `You read one of a startup's business documents and answer the questions from its company profile that the document states clearly. The profile covers the company, its customers, go-to-market, ideal customer profile and hiring.

Rules:
- Only answer a question when the document states it plainly. Skip anything you would have to guess, infer loosely or calculate. Never invent figures.
- For select questions, the value must be exactly one of the options listed.
- Numbers: digits only, no currency symbols, commas or units (e.g. 1300000; percent 42.5). Use the latest figure when the document shows several periods.
- Text answers: a short, plain sentence or phrase in the document's own terms.
- quote: the few words from the document that support the answer.`;

function content(input: ExtractionInput, questions: ProfileQuestion[]): Anthropic.Beta.BetaContentBlockParam[] {
  const ask = {
    type: "text" as const,
    text: `File: ${input.filename} (${input.docLabel}).\n\nQUESTIONS (JSON):\n${JSON.stringify(questions.map((q) => ({ key: q.key, section: q.section, question: q.label, kind: q.kind, ...(q.options ? { options: q.options } : {}) })))}\n\nAnswer the questions the document states clearly.`,
  };
  if (input.kind === "pdf") return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 }, title: input.filename }, ask];
  if (input.kind === "image") return [{ type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } }, ask];
  return [{ type: "text", text: `DOCUMENT:\n${input.text.slice(0, 80_000)}` }, ask];
}

/** The profile answers a document states clearly (none in test mode). */
export async function readProfileFromDocument(input: ExtractionInput, questions: ProfileQuestion[]): Promise<ProfileAnswer[]> {
  if (e2eEnabled() || !questions.length) return [];
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: betaZodOutputFormat(outputSchema) },
    messages: [{ role: "user", content: content(input, questions) }],
  });
  if (response.stop_reason === "refusal") return [];
  const parsed = outputSchema.safeParse(response.parsed_output);
  if (!parsed.success) return [];
  const known = new Set(questions.map((q) => q.key));
  return parsed.data.answers.filter((a) => known.has(a.key) && a.value.trim());
}
