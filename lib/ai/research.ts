import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { describeCriteria } from "@/lib/benchmarks";
import type { CohortCriteria } from "@/lib/db/schema";
import { METRICS, type MetricKey } from "@/lib/metrics";
import { AI_MODEL, anthropic } from "./config";

const metricKeys = Object.keys(METRICS) as [MetricKey, ...MetricKey[]];

export const researchSchema = z.object({
  sources: z.array(
    z.object({
      name: z.string(),
      publisher: z.string(),
      url: z.string(),
      year: z.number().int().nullable(),
      sample_description: z.string().nullable(),
    }),
  ),
  metrics: z.array(
    z.object({
      metric: z.enum(metricKeys),
      p25: z.number().nullable(),
      median: z.number().nullable(),
      top_quartile: z.number().nullable(),
      sample_size: z.number().int().nullable(),
      period: z.string().nullable(),
      source_index: z.number().int(),
      basis: z.string(),
    }),
  ),
  not_found: z.array(z.string()),
});

export type ResearchOutput = z.infer<typeof researchSchema>;

const UNITS: Record<string, string> = {
  usd: "US dollars as a whole number",
  percent: "percentage number (72% → 72)",
  days: "days",
  months: "months",
  count: "whole number",
  ratio: "plain ratio (1.4x → 1.4)",
};

const DICTIONARY = metricKeys
  .map((k) => `- ${k}: ${METRICS[k].label}, ${UNITS[METRICS[k].unit]}${METRICS[k].lowerIsBetter ? " (lower is better)" : ""}`)
  .join("\n");

const SYSTEM = `You research published B2B SaaS benchmark data for a benchmark library that advisors review before anything is used.

Use web search to find recent, publicly published benchmark reports and surveys (e.g. from investors, SaaS metrics firms, public datasets) that cover companies matching the cohort criteria. Prefer the most recent edition and the segment closest to the criteria.

Metrics you may report, with keys and units:
${DICTIONARY}

Rules:
- Report only figures a source actually publishes. Never estimate, interpolate or combine sources into a new number. If a quartile isn't published, set it to null.
- top_quartile is the better-performing quartile boundary: for lower-is-better metrics it is the smaller number. p25 is the weaker boundary.
- Every metric must point at the source it came from (source_index, 0-based into sources) and say in basis which segment/table it describes (e.g. "$1–5M ARR, median, 2025 survey"), in your own words. Do not copy report text.
- sources: name of the report, publisher, the exact URL of the page you read, year of the data, and the sample if stated.
- sample_size: the number of companies behind the figure if published, otherwise null.
- Put metrics you looked for but couldn't find in not_found.
- It is fine to return few or no metrics. Accuracy matters more than coverage.`;

export type ResearchResult = {
  output: ResearchOutput;
  /** URLs the search tool actually returned; anything cited must be among them. */
  searchedUrls: string[];
  dropped: string[];
  model: string;
  tokensIn: number;
  tokensOut: number;
};

export class ResearchError extends Error {}

const MAX_CONTINUATIONS = 4;

/** Runs one research pass for a cohort. Results are only proposals; an advisor approves each row. */
export async function researchBenchmarks(cohort: { name: string; criteria: CohortCriteria; description: string | null }): Promise<ResearchResult> {
  const ask = `Cohort: ${cohort.name}\nCriteria: ${describeCriteria(cohort.criteria)}${cohort.description ? `\nNotes: ${cohort.description}` : ""}\n\nFind published benchmark figures for this cohort.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: ask }];
  const searchedUrls = new Set<string>();
  let tokensIn = 0;
  let tokensOut = 0;

  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    const response = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      output_config: { effort: "high", format: betaZodOutputFormat(researchSchema) },
      messages,
    });
    tokensIn += response.usage.input_tokens;
    tokensOut += response.usage.output_tokens;

    for (const block of response.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === "web_search_result") searchedUrls.add(r.url);
      }
    }

    if (response.stop_reason === "pause_turn") {
      // The server-side search loop paused; send the turn back so it resumes.
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason === "refusal") throw new ResearchError("The research request was declined by the model.");
    if (response.stop_reason === "max_tokens") throw new ResearchError("The research produced more output than one run can hold.");

    const parsed = researchSchema.safeParse(response.parsed_output);
    if (!parsed.success) throw new ResearchError("The research returned invalid data.");
    const { output, dropped } = groundToSearch(parsed.data, [...searchedUrls]);
    return { output, searchedUrls: [...searchedUrls], dropped, model: response.model, tokensIn, tokensOut };
  }
  throw new ResearchError("The research didn't finish within the allowed number of search rounds.");
}

const normUrl = (u: string) => u.trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();

/**
 * Keeps only sources whose URL the search tool actually returned, and only
 * metrics that point at a kept source and have at least one value.
 */
export function groundToSearch(output: ResearchOutput, searchedUrls: string[]): { output: ResearchOutput; dropped: string[] } {
  const searched = new Set(searchedUrls.map(normUrl));
  const dropped: string[] = [];
  const keep = output.sources.map((s) => searched.has(normUrl(s.url)));
  output.sources.forEach((s, i) => {
    if (!keep[i]) dropped.push(`Source "${s.name}" (${s.url}) wasn't among the search results.`);
  });
  const newIndex = new Map<number, number>();
  const sources = output.sources.filter((s, i) => {
    if (!keep[i]) return false;
    newIndex.set(i, newIndex.size);
    return true;
  });
  const metrics = output.metrics.flatMap((m) => {
    const idx = newIndex.get(m.source_index);
    if (idx === undefined) {
      dropped.push(`${METRICS[m.metric].label}: its source couldn't be verified.`);
      return [];
    }
    if (m.p25 === null && m.median === null && m.top_quartile === null) return [];
    return [{ ...m, source_index: idx }];
  });
  return { output: { ...output, sources, metrics }, dropped };
}
