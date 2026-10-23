import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { e2eEnabled } from "@/lib/e2e";
import { ALL_ITEM_KEYS, CATEGORIES } from "@/lib/readiness";
import { AI_MODEL, anthropic } from "./config";

const itemKeys = ALL_ITEM_KEYS as [string, ...string[]];

export const classificationSchema = z.object({
  summary: z.string(),
  sections: z.array(
    z.object({
      sheet: z.string().nullable(),
      items: z.array(z.object({ key: z.enum(itemKeys), confidence: z.enum(["high", "medium", "low"]), reason: z.string() })),
    }),
  ),
});

export type Classification = z.infer<typeof classificationSchema>;

const CATALOG = CATEGORIES.map(
  (c) => `${c.letter}. ${c.name}\n${c.items.map((i) => `- ${i.key}: ${i.name}. ${i.description}`).join("\n")}`,
).join("\n\n");

const SYSTEM = `You help a startup founder organise the files they've uploaded into Growth Goaled's data checklist. Founders often put everything in one messy spreadsheet or deck.

Checklist items (use only these keys):
${CATALOG}

For the file you're given, say which checklist items it contains real data for.
Rules:
- Only suggest an item when the file actually holds that data (e.g. a monthly revenue row or column, a customer table with revenue), not when it merely mentions the topic.
- For spreadsheets, give one section per sheet that holds relevant data (sheet = the sheet name); otherwise one section with sheet = null.
- confidence: high when the data is clearly there; medium when it's there but partial or loosely labelled; low when you're inferring.
- reason: a short note a founder will recognise ("Sheet 'P&L' has revenue by month for 2025"). Don't quote figures.
- summary: one sentence on what the file is.
- It's fine to suggest nothing.`;

export type ClassifyInput =
  | { kind: "sheets"; filename: string; sheets: { name: string; rows: string[][] }[] }
  | { kind: "text"; filename: string; text: string }
  | { kind: "pdf"; filename: string; base64: string }
  | { kind: "image"; filename: string; base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" };

/** Keeps the prompt small: first rows and columns of each sheet only. */
export function sheetPreview(sheets: { name: string; rows: string[][] }[]): string {
  return sheets
    .slice(0, 25)
    .map((s) => {
      const rows = s.rows.filter((r) => r.some((c) => c.trim())).slice(0, 8);
      const body = rows.map((r) => r.slice(0, 30).map((c) => c.replace(/\s+/g, " ").slice(0, 40)).join(" | ")).join("\n");
      return `### Sheet "${s.name}" (${s.rows.length} rows)\n${body}`;
    })
    .join("\n\n");
}

function content(input: ClassifyInput): Anthropic.Beta.BetaContentBlockParam[] {
  const ask = { type: "text" as const, text: `File: ${input.filename}. Which checklist items does it contain?` };
  switch (input.kind) {
    case "sheets":
      return [{ type: "text", text: `Preview of each sheet (first rows):\n\n${sheetPreview(input.sheets)}` }, ask];
    case "text":
      return [{ type: "text", text: `File contents (start):\n\n${input.text.slice(0, 20000)}` }, ask];
    case "pdf":
      return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 }, title: input.filename }, ask];
    case "image":
      return [{ type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } }, ask];
  }
}

export class ClassifyError extends Error {}

export async function classifyFile(input: ClassifyInput): Promise<{ result: Classification; model: string; tokensIn: number; tokensOut: number }> {
  if (e2eEnabled()) return { result: { summary: "Test mode.", sections: [] }, model: "e2e-fake", tokensIn: 0, tokensOut: 0 };
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: betaZodOutputFormat(classificationSchema) },
    messages: [{ role: "user", content: content(input) }],
  });
  if (response.stop_reason === "refusal") throw new ClassifyError("The file couldn't be sorted (declined by the model).");
  if (response.stop_reason === "max_tokens") throw new ClassifyError("The file was too large to sort in one pass.");
  const parsed = classificationSchema.safeParse(response.parsed_output);
  if (!parsed.success) throw new ClassifyError("Sorting returned an unexpected format.");
  return { result: parsed.data, model: response.model, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
}
