import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { e2eEnabled } from "@/lib/e2e";
import { AI_MODEL, anthropic } from "./config";

/**
 * Conflict detection in the CRO intelligence library (Nov 24, 2026): does a newly validated record
 * give guidance that opposes another CRO's record for the same kind of situation? Flags are
 * suggestions; a CRO or an admin confirms or dismisses each.
 */

export type ConflictRecord = { id: string; cro: string; title: string; content: string; category: string | null };

const outputSchema = z.object({ conflicts: z.array(z.object({ id: z.string(), why: z.string() })) });

const SYSTEM = `You compare CRO advice records in an advisory firm's knowledge library. Given one record and some candidates from other CROs, list only the candidates that give materially opposing guidance for the same kind of founder situation (e.g. one says hire a salesperson now, the other says keep founder-led selling for another quarter).

- Different emphasis, complementary advice, or advice for different situations is NOT a conflict.
- For each conflict, why: one sentence naming the opposing positions and the assumption that separates them.
- Return [] when nothing conflicts. Use candidate ids exactly as given.`;

export async function findConflicts(record: ConflictRecord, candidates: ConflictRecord[]): Promise<{ id: string; why: string }[]> {
  if (!candidates.length) return [];
  if (e2eEnabled()) {
    // Test stand-in: another CRO's record in the same category conflicts.
    return candidates.filter((c) => c.category && c.category === record.category && c.cro !== record.cro).map((c) => ({ id: c.id, why: `Test mode: ${record.cro} and ${c.cro} disagree on ${c.category}.` }));
  }
  const brief = (r: ConflictRecord) => ({ id: r.id, cro: r.cro, title: r.title, content: r.content.slice(0, 1500) });
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: betaZodOutputFormat(outputSchema) },
    messages: [{ role: "user", content: `RECORD (JSON): ${JSON.stringify(brief(record))}\n\nCANDIDATES (JSON): ${JSON.stringify(candidates.map(brief))}` }],
  });
  if (response.stop_reason === "refusal") return [];
  const parsed = outputSchema.safeParse(response.parsed_output);
  if (!parsed.success) return [];
  const known = new Set(candidates.map((c) => c.id));
  return parsed.data.conflicts.filter((c) => known.has(c.id)).map((c) => ({ id: c.id, why: c.why.slice(0, 500) }));
}
