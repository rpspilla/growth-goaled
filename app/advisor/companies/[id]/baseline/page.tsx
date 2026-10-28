import { QA_CHECKS } from "@/lib/ai/qa";
import { ApproveAssessment } from "@/components/use-cases/ApproveAssessment";
import { AssessmentResults } from "@/components/views/AssessmentResults";
import { db, schema } from "@/lib/db";
import { assessmentView, latestAssessment } from "@/lib/data/assessments";
import { isStalled } from "@/lib/data/deliverables";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { targetSummary } from "@/lib/use-cases";
import { approveAssessmentAction, setBenchmarkChoice } from "../actions";
import { BenchmarkChoices, type ChoiceRow } from "@/components/benchmark-library/BenchmarkChoices";
import { benchmarkOptions, companyFigures } from "@/lib/data/benchmark-library";
import { KEY_METRICS } from "@/lib/diagnostics";
import { companyContext } from "../context";
import { dimensionViews } from "@/lib/data/dimensions";

const card = { background: "var(--card)", borderColor: "var(--border)" };
const STATE: Record<string, string> = {
  drafting: "Drafting",
  qa: "Checking",
  in_review: "Visible to the founder",
  published: "Reviewed",
  failed: "Failed",
};

/** Step 4 mirrored: the founder's assessment for the active use case, its QA results, and "mark reviewed". */
export default async function CompanyResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { company, active } = await companyContext((await params).id);
  const d = active ? await latestAssessment(company.id, active.def.id) : null;
  const [view, qa] = d
    ? await Promise.all([
        assessmentView(d),
        db
          .select({ qa: schema.reviews.qaResults })
          .from(schema.reviews)
          .where(and(eq(schema.reviews.deliverableId, d.id), isNotNull(schema.reviews.qaResults)))
          .orderBy(desc(schema.reviews.createdAt))
          .limit(1)
          .then((r) => r[0]?.qa ?? null),
      ])
    : [null, null];
  const status = d ? (isStalled(d) ? "failed" : d.status) : null;
  // Benchmark choices for the metrics this assessment compares.
  const figures = active ? await companyFigures(company.id, [...new Set([...active.def.figures, ...KEY_METRICS[active.def.id]])]) : [];
  const choices: ChoiceRow[] = (await benchmarkOptions(company, figures)).map((o) => ({
    metric: o.metric,
    label: o.label,
    auto: o.auto.status === "matched" ? `${o.auto.records[0]!.datasetName} v${o.auto.records[0]!.version} · ${o.auto.records[0]!.period}` : o.auto.reason,
    autoQuality: o.auto.status === "matched" ? o.auto.quality : null,
    current: o.override ? { choice: o.override.recordId ?? "none", reason: o.override.reason } : null,
    options: o.options,
  }));
  const target = targetSummary(active?.objective);

  return (
    <div className="space-y-2">
      <div className="px-4 sm:px-8 pt-8 max-w-5xl space-y-4">
        <div>
          <div className="label mb-1" style={{ color: "var(--muted-foreground)" }}>Step 4 · Results{active ? ` · ${active.def.shortTitle}` : ""}</div>
          <h1 className="font-display text-3xl font-normal" style={{ color: "var(--foreground)" }}>{company.name}: results</h1>
          {target && <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>Founder&apos;s target: {target}</p>}
        </div>
        {!active && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No purchased assessment yet.</p>}
        {active && !d && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>The founder hasn&apos;t run this assessment yet.</p>}
        {d && (
          <div className="rounded-xl border p-5 space-y-3" style={{ ...card, borderStyle: "dashed" }} aria-label="Review and checks (advisor only)">
            <div className="label">Advisor only · not shown to the founder</div>
            <div className="flex items-center gap-3 flex-wrap text-base">
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>Version {d.version}</span>
              <span style={{ color: status === "failed" || d.codeChecksPassed === false ? "var(--red)" : "var(--green)" }}>
                {d.codeChecksPassed === false
                  ? "Failed the code checks (hidden from the founder)"
                  : d.reviewRequired && d.status === "in_review"
                    ? "Waiting for your review: hidden from the founder until you mark it reviewed (fewer than the required recorded sales calls)"
                    : STATE[status ?? ""] ?? status}
              </span>
            </div>
            {qa && (
              <ul className="grid sm:grid-cols-2 gap-2 text-sm">
                {QA_CHECKS.map((c) => {
                  const r = qa[c.key];
                  return (
                    <li key={c.key} style={{ color: "var(--muted-foreground)" }}>
                      <span className="font-semibold" style={{ color: r?.result === "pass" ? "var(--green)" : "var(--red)" }}>{r?.result === "pass" ? "✓" : "✗"} {c.key === "benchmark_methodology" ? "Method" : c.label}</span>
                      {r?.note && ` · ${r.note}`}
                    </li>
                  );
                })}
              </ul>
            )}
            {d.status === "in_review" && d.codeChecksPassed && <ApproveAssessment companyId={company.id} deliverableId={d.id} approve={approveAssessmentAction} />}
          </div>
        )}
        {active && <BenchmarkChoices companyId={company.id} rows={choices} save={setBenchmarkChoice} />}
      </div>
      {view && active && (
        <div className="px-4 sm:px-8 pt-6 max-w-5xl">
          <div className="border-t pt-4 label" style={{ borderColor: "var(--border)" }}>What the founder sees</div>
        </div>
      )}
      {view && active && (
        <AssessmentResults
          title={active.def.question}
          data={view}
          nextUseCase={null}
          advisory={null}
          dimensions={await dimensionViews(company, active.def, `/advisor/companies/${company.id}/data`)}
        />
      )}
    </div>
  );
}
