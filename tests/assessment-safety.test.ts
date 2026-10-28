import { describe, expect, it } from "vitest";
import type { AssessmentInput } from "@/lib/ai/assessment";
import { checkDraft } from "@/lib/deliverables/checks";
import { claimsFromAssessment, completeness, fallbackAssessment, sanitizeAssessment, systemGaps } from "@/lib/deliverables/assessment-safety";

const base: AssessmentInput = {
  use_case: { id: "growth_leak", question: "Where is our growth leaking?", founder_gets: [], brief: "" },
  company: { name: "Co", stage: "Seed", industry: null, primary_segment: null, sales_model: null, revenue_band: null },
  founder_answers: [{ id: "answer:goal", question: "Goal", answer: "Grow again" }],
  founder_target: null,
  figures: [
    { id: "dp1", metric: "nrr", label: "NRR", value: "94%", lower_is_better: false, confirmed: true, period: null },
    { id: "dp2", metric: "arr", label: "ARR", value: "$2.1M", lower_is_better: false, confirmed: false, period: null },
  ],
  data_supplied: [
    { id: "item:monthly_revenue", item: "Monthly revenue", priority: "required", status: "available", coverage: null, files: 1, columns: [] },
    { id: "item:revenue_by_customer", item: "Revenue by customer", priority: "required", status: "missing", coverage: null, files: 0, columns: [] },
    { id: "item:churned_revenue", item: "Churned revenue", priority: "required", status: "partial", coverage: null, files: 0, columns: [] },
  ],
  reference: [],
  reference_note: "No approved peer reference data matches this company yet.",
  open_questions: [],
  unreadable_files: ["board-deck.key"],
  conflicts: [],
  completeness: "partial",
};

describe("assessment safety", () => {
  it("lists every gap it can see in code, whatever the model writes", () => {
    expect(systemGaps(base)).toEqual([
      "Revenue by customer hasn't been shared yet, so conclusions that depend on it are limited.",
      "Churned revenue is only partly available.",
      "We couldn't read board-deck.key.",
      "ARR was read from your files and not yet confirmed by you.",
    ]);
    const noAnswers = systemGaps({ ...base, figures: [], founder_answers: [] });
    expect(noAnswers).toEqual(expect.arrayContaining(["We couldn't read figures from the files you shared, so this report rests on your answers and the data you described."]));
    // The questionnaire no longer asks for a goal or context, so having no answers isn't a gap.
    expect(noAnswers.join(" ")).not.toMatch(/questionnaire/);
  });

  it("rates completeness", () => {
    expect(completeness(base)).toBe("partial");
    expect(completeness({ ...base, data_supplied: base.data_supplied.map((d) => ({ ...d, status: "missing" })), figures: [] })).toBe("minimal");
    const all = {
      ...base,
      unreadable_files: [],
      data_supplied: base.data_supplied.map((d) => ({ ...d, status: "available" })),
      figures: [...base.figures.map((f) => ({ ...f, confirmed: true })), { ...base.figures[0]!, id: "dp3", metric: "grr", label: "GRR", value: "88%" }],
    };
    expect(completeness(all)).toBe("complete");
  });

  it("builds a fallback brief that passes the code checks by construction", () => {
    const out = fallbackAssessment(base);
    const valid = new Set(["dp1", "dp2", "answer:goal", ...base.data_supplied.map((d) => d.id)]);
    const check = checkDraft(claimsFromAssessment(out), [94, 2_100_000], valid);
    expect(check).toEqual({ untracedNumbers: [], unsourcedClaims: [], unknownSources: [] });
    expect(out.evidence.map((f) => f.text)).toEqual(["NRR is 94%.", "ARR is $2.1M (read from your file, not yet confirmed)."]);
    expect(out.diagnosis.primary.title).toBe("Not yet established");
    // Even with nothing at all to cite, statements cite the data the use case asks for.
    const empty = fallbackAssessment({ ...base, figures: [], founder_answers: [], data_supplied: base.data_supplied.map((d) => ({ ...d, status: "missing" })) });
    expect(empty.executive_decision.sources.length).toBeGreaterThan(0);
  });

  it("builds the fallback from the rule-based diagnosis when there is one", () => {
    const input: AssessmentInput = {
      ...base,
      diagnosis: {
        certainty: "established",
        candidates: [
          { id: "retention", title: "Revenue lost from existing customers", arr_at_stake: "$10.8K", context: ["ev:0"], supporting: ["ev:1"], contradicting: [], test: "List the churned accounts." },
          { id: "acquisition", title: "Too little new business", arr_at_stake: null, context: [], supporting: [], contradicting: ["ev:2"], test: "Split new business by month." },
        ],
        evidence: [
          { id: "ev:0", text: "$10.8K of ARR lost to churn.", kind: "calculated" },
          { id: "ev:1", text: "NRR 94% (calculated): the base shrinks.", kind: "calculated" },
          { id: "ev:2", text: "New ARR ($9.6K) was less than losses.", kind: "calculated" },
        ],
        unknowns: ["Win Rate isn't available yet."],
      },
    };
    const out = fallbackAssessment(input);
    expect(out.executive_decision.decision).toBe("Start with revenue lost from existing customers.");
    expect(out.diagnosis.primary).toMatchObject({ candidate_id: "retention", explanation: "NRR 94% (calculated): the base shrinks. $10.8K of ARR lost to churn." });
    expect(out.diagnosis.alternatives.map((a) => a.candidate_id)).toEqual(["acquisition"]);
    expect(out.evidence.map((e) => [e.status, e.bearing])).toEqual([["calculated", "context"], ["calculated", "supports"], ["calculated", "context"]]);
    expect(out.action_plan[0]!.action).toBe("List the churned accounts.");
    expect(out.data_gaps).toEqual(["Win Rate isn't available yet."]);
    const valid = new Set(["dp1", "dp2", "answer:goal", ...base.data_supplied.map((d) => d.id), "ev:0", "ev:1", "ev:2", "candidate:retention", "candidate:acquisition"]);
    expect(checkDraft(claimsFromAssessment(out), [94, 10_800, 9_600, 2_100_000], valid)).toEqual({ untracedNumbers: [], unsourcedClaims: [], unknownSources: [] });
    // Unresolved: no root cause is picked.
    const unresolved = fallbackAssessment({ ...input, diagnosis: { ...input.diagnosis!, certainty: "unresolved" } });
    expect(unresolved.diagnosis.primary.title).toMatch(/^Not yet established/);
    expect(unresolved.recommendation.option).toBe("Close the main data gaps first, then decide");
  });

  it("drops statements that fail the checks instead of the whole brief", () => {
    const out = fallbackAssessment(base);
    out.evidence.push({ text: "Peers churn 5%.", status: "inference", bearing: "supports", dimension: null, sources: ["nope"] });
    out.diagnosis.primary = { candidate_id: null, title: "Growth fell 40%.", explanation: "", sources: ["dp1"] };
    out.change_triggers.push({ if_this: "NRR falls below 85%", then_this: "Switch focus." });
    const check = checkDraft(claimsFromAssessment(out), [94, 2_100_000], new Set(["dp1", "dp2", "answer:goal", ...base.data_supplied.map((d) => d.id)]));
    const { output, removed } = sanitizeAssessment(out, check);
    expect(removed).toBe(3);
    expect(output.evidence.map((f) => f.text)).not.toContain("Peers churn 5%.");
    expect(output.diagnosis.primary.explanation).toMatch(/couldn't verify a full diagnosis/);
    expect(output.change_triggers.map((t) => t.if_this)).not.toContain("NRR falls below 85%");
    expect(output.data_gaps).toContain("Some statements couldn't be verified against your data and were left out.");
  });
});
