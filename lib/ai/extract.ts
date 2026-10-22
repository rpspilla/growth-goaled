import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { METRICS, type MetricKey } from "@/lib/metrics";
import { AI_MODEL, anthropic } from "./config";

const metricKeys = Object.keys(METRICS) as [MetricKey, ...MetricKey[]];

export const extractedPointSchema = z.object({
  metric: z.enum(metricKeys),
  value: z.number(),
  period: z.string().nullable(),
  page: z.number().int().nullable(),
  raw_text: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  inferred: z.boolean(),
});

export const extractionSchema = z.object({ data_points: z.array(extractedPointSchema) });

export type ExtractedPoint = z.infer<typeof extractedPointSchema>;

const UNIT_RULES: Record<string, string> = {
  usd: "US dollars as a whole number (4.2M → 4200000)",
  percent: "a percentage number (72% → 72, not 0.72)",
  days: "days",
  months: "months",
  count: "a whole number",
  ratio: "a plain ratio (1.4x → 1.4)",
};

const DICTIONARY = metricKeys
  .map((k) => `- ${k}: ${METRICS[k].label}, value in ${UNIT_RULES[METRICS[k].unit]}`)
  .join("\n");

const SYSTEM = `You extract operating metrics for a Series A B2B SaaS company from one of its documents (board deck, financial model, customer list, GTM or hiring plan).

Extract only these metrics, using exactly these keys and units:
${DICTIONARY}

Rules:
- Use only figures that appear in the document. Never estimate, assume or fill gaps with typical values. If a metric isn't present, leave it out.
- If you compute a value from stated figures (e.g. ARR from MRR x 12, AE productivity from new ARR / AEs), set inferred: true and say how in raw_text.
- raw_text: the exact wording or table cells the figure comes from (under 300 characters), so a person can find it.
- period: the period the figure describes as written ("Q3 2026", "FY2025", "Sep 2026", "TTM"), or null if none is stated.
- page: the 1-based page number for PDFs, otherwise null.
- confidence: high when the figure is stated plainly; medium when labels are ambiguous; low when you had to interpret it.
- When a metric appears for several periods, include each period once. Do not repeat the same metric and period.
- Return an empty list if the document has none of these metrics.`;

export type ExtractionInput =
  | { kind: "pdf"; base64: string; filename: string; docLabel: string }
  | { kind: "text"; text: string; filename: string; docLabel: string };

export type ExtractionResult = {
  points: ExtractedPoint[];
  tokensIn: number;
  tokensOut: number;
  model: string;
};

function content(input: ExtractionInput): Anthropic.Beta.BetaContentBlockParam[] {
  const ask = `Document type: ${input.docLabel}. File: ${input.filename}. Extract the metrics.`;
  if (input.kind === "pdf") {
    return [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 }, title: input.filename },
      { type: "text", text: ask },
    ];
  }
  return [
    { type: "document", source: { type: "text", media_type: "text/plain", data: input.text }, title: input.filename },
    { type: "text", text: ask },
  ];
}

export class ExtractionError extends Error {}

/**
 * Runs one extraction. The response is validated against `extractionSchema`;
 * an invalid response is retried once before failing.
 */
export async function extractMetrics(input: ExtractionInput): Promise<ExtractionResult> {
  let tokensIn = 0;
  let tokensOut = 0;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      // A policy decline is retried server-side on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "medium", format: betaZodOutputFormat(extractionSchema) },
      messages: [{ role: "user", content: content(input) }],
    });
    tokensIn += response.usage.input_tokens;
    tokensOut += response.usage.output_tokens;

    if (response.stop_reason === "refusal") {
      throw new ExtractionError("The document couldn't be analysed (declined by the model).");
    }
    if (response.stop_reason === "max_tokens") {
      throw new ExtractionError("The document produced more data than one extraction can hold.");
    }
    const parsed = extractionSchema.safeParse(response.parsed_output);
    if (parsed.success) {
      const points = parsed.data.data_points.filter((p) => Number.isFinite(p.value) && p.value >= 0);
      return { points, tokensIn, tokensOut, model: response.model };
    }
  }
  throw new ExtractionError("The analysis returned invalid data twice.");
}
