import Link from "next/link";
import { ReadinessReview, type ReviewItem } from "@/components/advisor/ReadinessReview";
import { getReadiness } from "@/lib/data/readiness";
import { listRegisterItems } from "@/lib/data/registers";
import { CATEGORIES, getItem } from "@/lib/readiness";
import { registerTypeMeta } from "@/lib/registers";
import { chooseFigureForCompany, enterFigureForCompany, reviewItem } from "../actions";
import { FigureChecker } from "@/components/use-cases/FigureChecker";
import { figureChoices } from "@/lib/data/figures";
import { assessmentMetrics } from "@/lib/use-cases";
import { companyContext } from "../context";

const card = { background: "var(--card)", borderColor: "var(--border)" };

/** Step 3 mirrored: everything the founder shared, with validation and follow-ups. */
export default async function CompanyDataPage({ params }: { params: Promise<{ id: string }> }) {
  const { company, active } = await companyContext((await params).id);
  const [readiness, questions, choices] = await Promise.all([
    getReadiness(company),
    listRegisterItems([company.id], { status: "open" }),
    active ? figureChoices(company, assessmentMetrics(active.def, active.objective)) : Promise.resolve([]),
  ]);
  const choose = chooseFigureForCompany.bind(null, company.id);
  const enter = enterFigureForCompany.bind(null, company.id);
  const a = readiness.assessment;

  const reviewItems: ReviewItem[] = readiness.items.flatMap((i) => {
    const def = getItem(i.itemKey);
    if (!def) return [];
    const months = i.coverageStart && i.coverageEnd ? `${i.coverageStart.slice(0, 7)} to ${i.coverageEnd.slice(0, 7)}` : null;
    return [
      {
        key: i.itemKey,
        name: def.name,
        category: def.category,
        required: def.required,
        status: i.status,
        quality: i.quality,
        coverage: months,
        sourceSystem: i.sourceSystem,
        limitations: i.limitations,
        followUp: i.followUp,
        defaultFollowUp: def.followUp,
        files: readiness.files.filter((f) => f.itemKeys.includes(i.itemKey)).length,
      },
    ];
  });
  const order = new Map(CATEGORIES.flatMap((c) => c.items.map((it) => it.key)).map((k, n) => [k, n]));
  reviewItems.sort((x, y) => (order.get(x.key) ?? 0) - (order.get(y.key) ?? 0));

  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl space-y-6">
      <div>
        <div className="label mb-1" style={{ color: "var(--muted-foreground)" }}>Step 3 · Data{active ? ` · ${active.def.shortTitle}` : ""}</div>
        <h1 className="font-display text-3xl font-normal" style={{ color: "var(--foreground)" }}>{company.name}: data</h1>
      </div>
      {choices.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Founders aren&apos;t asked to settle figures: reports use the value calculated from their file first. Confirm or correct any that disagree.
          </p>
          <FigureChecker choices={choices} choose={choose} enter={enter} />
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="rounded-xl border p-5" style={card}>
          <div className="label mb-3" style={{ color: "var(--muted-foreground)" }}>Data readiness</div>
          <div className="space-y-2 text-xs">
            {[
              ["Required items supplied", `${a.collection.requiredPercent}%`],
              ["Validated by advisor", `${a.quality.validated} of ${a.quality.supplied}`],
              ["Quality concerns", String(a.quality.issues.filter((i) => i.kind !== "no_coverage").length)],
              ["Metrics blocked", String(a.analytical.filter((m) => m.state === "blocked").length)],
              ["Files", String(readiness.files.length)],
              ["Open questions", String(questions.filter((q) => q.owner === "founder").length)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span style={{ color: "var(--muted-foreground)" }}>{k}</span>
                <span className="font-mono font-medium" style={{ color: "var(--foreground)" }}>{v}</span>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3" style={{ color: a.readyForBenchmark ? "var(--green)" : "var(--muted-foreground)" }}>
            {a.readyForBenchmark ? "Inputs the benchmark needs are supplied." : a.benchmarkBlockers.join("; ")}
          </p>
        </div>
      </div>
      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>Review the founder&apos;s data</h2>
          <ReadinessReview companyId={company.id} items={reviewItems} review={reviewItem} />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Open questions · {questions.length}</h2>
              <Link href={`/advisor/registers?company=${company.id}`} className="text-xs" style={{ color: "var(--green)" }}>Registers →</Link>
            </div>
            <div className="rounded-xl border" style={card}>
              {questions.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--muted-foreground)" }}>None open.</div>}
              {questions.slice(0, 6).map((q) => (
                <div key={q.id} className="px-4 py-2.5 border-b text-sm" style={{ borderColor: "var(--border)" }}>
                  <span className="text-xs mr-2" style={{ color: registerTypeMeta(q.type).color }}>{registerTypeMeta(q.type).badge}</span>
                  <span style={{ color: "var(--foreground)" }}>{q.title}</span>
                  {q.owner === "advisor" && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}> · advisor</span>}
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>Files · {readiness.files.length}</h2>
            <div className="rounded-xl border" style={card}>
              {readiness.files.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--muted-foreground)" }}>No files uploaded.</div>}
              {readiness.files.slice(0, 10).map((f) => (
                <div key={f.id} className="px-4 py-2.5 border-b text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  <span className="text-sm" style={{ color: "var(--foreground)" }}>{f.filename}</span> · {f.status}
                  {f.dataPointsFound > 0 && ` · ${f.dataPointsFound} values`}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
