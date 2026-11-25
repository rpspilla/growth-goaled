import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { e2eEnabled } from "@/lib/e2e";
import { criteriaFor } from "@/lib/evals";
import { AI_MODEL, anthropic } from "./config";

/**
 * The evaluation judge (Nov 24, 2026): scores one AI CRO answer against the multi-CRO rubric. For a
 * CRO's AI it sees that CRO's profile and, when there is one, the CRO's own answer to the scenario
 * from their training workbook (the reference). For the Collective it sees the records it was given.
 */

const outputSchema = z.object({
  scores: z.array(z.object({ criterion: z.string(), score: z.number().int().min(1).max(5).nullable(), note: z.string() })),
  summary: z.string(),
});

export type JudgeInput = {
  mode: "individual" | "collective";
  scenario: { situation: string; question: string; stage: string | null };
  answer: { reply: string; card: unknown; used: string[] };
  cro: { name: string; profile: unknown } | null;
  reference: string | null;
  records: { id: string; cro: string; title: string; content: string }[];
};

const SYSTEM = `You evaluate an AI CRO's answer to a founder's question for an advisory firm. Be strict and specific: a 5 is what an excellent human CRO would say; a 3 is generic but not wrong; a 1 is wrong or harmful.

- Score every criterion listed, 1 to 5, or null when it can't apply to a single question (e.g. continuity with no prior conversation).
- note: one short sentence with the evidence for the score.
- For a CRO's AI: judge fidelity against their profile and, when given, their own answer to this scenario (the reference). An answer that claims experiences, clients or opinions not in the profile, records or reference scores 1 on no_invented_experience.
- For the Collective: judge against the records it was given (with their CROs) and whether it says where they differ.
- summary: two sentences: the answer's main strength and its main weakness.`;

export async function judgeAnswer(input: JudgeInput): Promise<{ scores: Record<string, number | null>; notes: Record<string, string>; summary: string }> {
  const criteria = criteriaFor(input.mode);
  if (e2eEnabled()) {
    return { scores: Object.fromEntries(Object.keys(criteria).map((k) => [k, k === "continuity" ? null : 4])), notes: Object.fromEntries(Object.keys(criteria).map((k) => [k, "Test mode"])), summary: "Test mode: a sound answer." };
  }
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: betaZodOutputFormat(outputSchema) },
    messages: [
      {
        role: "user",
        content: [
          `MODE: ${input.mode === "individual" ? `${input.cro?.name}'s CRO-Brain` : "Rally Collective Brain"}`,
          `CRITERIA (JSON): ${JSON.stringify(criteria)}`,
          `SCENARIO: (${input.scenario.stage ?? "any stage"}) ${input.scenario.situation}\nQuestion: ${input.scenario.question}`,
          input.cro ? `CRO PROFILE (JSON): ${JSON.stringify(input.cro.profile)}` : "",
          input.reference ? `THE CRO'S OWN ANSWER (reference): ${input.reference.slice(0, 4000)}` : "",
          `RECORDS GIVEN TO THE AI (JSON): ${JSON.stringify(input.records.map((r) => ({ id: r.id, cro: r.cro, title: r.title, content: r.content.slice(0, 800) })))}`,
          `THE AI CRO'S ANSWER (JSON): ${JSON.stringify(input.answer)}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });
  const parsed = outputSchema.safeParse(response.parsed_output);
  if (response.stop_reason === "refusal" || !parsed.success) throw new Error("The judge couldn't score this answer.");
  const known = new Set(Object.keys(criteria));
  const scores: Record<string, number | null> = {};
  const notes: Record<string, string> = {};
  for (const s of parsed.data.scores) {
    if (!known.has(s.criterion)) continue;
    scores[s.criterion] = s.score;
    notes[s.criterion] = s.note.slice(0, 300);
  }
  return { scores, notes, summary: parsed.data.summary.slice(0, 600) };
}
