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
    expect(systemGaps({ ...base, figures: [], founder_answers: [] })).toEqual(
      expect.arrayContaining([
        "We couldn't read figures from the files you shared, so this report rests on your answers and the data you described.",
        "The questionnaire wasn't answered, so the report can't reflect your goal or context.",
      ]),
    );
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

  it("builds a fallback report that passes the code checks by construction", () => {
    const out = fallbackAssessment(base);
    const valid = new Set(["dp1", "dp2", "answer:goal", ...base.data_supplied.map((d) => d.id)]);
    const check = checkDraft(claimsFromAssessment(out), [94, 2_100_000], valid);
    expect(check).toEqual({ untracedNumbers: [], unsourcedClaims: [], unknownSources: [] });
    expect(out.findings.map((f) => f.text)).toEqual(["NRR is 94%.", "ARR is $2.1M (read from your file, not yet confirmed)."]);
    // Even with nothing at all to cite, statements cite the data the use case asks for.
    const empty = fallbackAssessment({ ...base, figures: [], founder_answers: [], data_supplied: base.data_supplied.map((d) => ({ ...d, status: "missing" })) });
    expect(empty.summary.sources.length).toBeGreaterThan(0);
  });

  it("drops statements that fail the checks instead of the whole report", () => {
    const out = fallbackAssessment(base);
    out.findings.push({ kind: "concern", text: "Peers churn 5%.", sources: ["nope"] });
    out.diagnosis = { text: "Growth fell 40%.", sources: ["dp1"] };
    const check = checkDraft(claimsFromAssessment(out), [94, 2_100_000], new Set(["dp1", "dp2", "answer:goal", ...base.data_supplied.map((d) => d.id)]));
    const { output, removed } = sanitizeAssessment(out, check);
    expect(removed).toBe(2);
    expect(output.findings.map((f) => f.text)).not.toContain("Peers churn 5%.");
    expect(output.diagnosis.text).toMatch(/couldn't verify a full diagnosis/);
    expect(output.data_gaps).toContain("Some statements couldn't be verified against your data and were left out.");
  });
});
