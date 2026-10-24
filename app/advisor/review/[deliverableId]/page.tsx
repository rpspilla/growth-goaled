import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { GenerateButton } from "@/components/deliverables/GenerateButton";
import { ReviewActions } from "@/components/deliverables/ReviewActions";
import { STATUS_LABEL } from "@/components/deliverables/status";
import { BenchmarkView } from "@/components/views/BenchmarkView";
import { QA_CHECKS } from "@/lib/ai/qa";
import { requireRole } from "@/lib/auth/session";
import { benchmarkViewFor } from "@/lib/data/benchmark";
import { getManagedCompany } from "@/lib/data/companies";
import { deliverableReviews, deliverableRuns, getDeliverable, isStalled, listQueue } from "@/lib/data/deliverables";
import { benchmarkContentSchema } from "@/lib/deliverables/benchmark";
import { approve, generateBenchmark, publish, saveEdits, sendBack } from "../actions";
import { founderCanSeePreliminary } from "@/lib/data/preliminary";

export const maxDuration = 300;

const DECISION: Record<string, string> = { approve: "Approved", request_changes: "Edited by advisor", send_back: "Sent back to AI" };

export default async function ReviewPage({ params }: { params: Promise<{ deliverableId: string }> }) {
  const user = await requireRole(["advisor", "admin"]);
  const { deliverableId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(deliverableId)) notFound();
  const d = await getDeliverable(deliverableId);
  const company = d ? await getManagedCompany(user, d.companyId) : null;
  if (!d || !company) notFound();

  const [runs, reviews, view, versions] = await Promise.all([deliverableRuns(d.id), deliverableReviews(d.id), d.content ? benchmarkViewFor(d) : null, listQueue([company.id])]);
  const status = isStalled(d) ? "stalled" : d.status;
  const s = STATUS_LABEL[status] ?? { label: status, color: "var(--muted-foreground)" };
  const qa = reviews.find((r) => r.review.qaResults)?.review.qaResults ?? null;
  const draftRun = runs.find((r) => r.agent === "draft");
  const qaRun = runs.find((r) => r.agent === "qa");
  const missing = ((draftRun?.output as { draft?: { missing_inputs?: string[] } } | null)?.draft?.missing_inputs ?? []) as string[];
  const content = benchmarkContentSchema.safeParse(d.content);
  const edits = content.success
    ? {
        headline: d.headline ?? "",
        insightHeadline: content.data.insight.headline,
        insightBody: content.data.insight.body,
        strengths: content.data.summary.strengths.map((x) => x.text),
        watchAreas: content.data.summary.watchAreas.map((x) => x.text),
        priority: content.data.summary.priority.text,
      }
    : null;
  const failedRun = runs.find((r) => r.status === "failed");
  const card = { background: "var(--card)", borderColor: "var(--border)" };
  const runStatus = (r: typeof draftRun) =>
    !r ? <span style={{ color: "var(--muted-foreground)" }}>Not run</span> : r.status === "succeeded" ? <span style={{ color: "var(--green)" }}>Complete ✓</span> : r.status === "failed" ? <span style={{ color: "var(--red)" }}>Failed</span> : <span style={{ color: "var(--amber)" }}>Running...</span>;

  return (
    <div className="p-8 max-w-7xl">
      <Link href="/advisor/review" className="text-xs" style={{ color: "var(--muted-foreground)" }}>← Review Queue</Link>
      <PageHeader title={`${company.name} — Benchmark`} subtitle={<>Version {d.version} · <span style={{ color: s.color, fontWeight: 600 }}>{s.label}</span></>} />

      {d.preliminary && (
        <div className="rounded-xl border p-4 mb-6 text-sm" style={{ ...card, borderColor: "var(--amber)", color: "var(--foreground)" }}>
          <span className="font-semibold">Preliminary report</span>, built automatically after the founder&apos;s uploads.{" "}
          {founderCanSeePreliminary(d)
            ? company.benchmarkUnlockedAt
              ? "The founder has paid and can see this version now, labelled as not yet advisor-reviewed."
              : "The founder can see it after paying to unlock, labelled as not yet advisor-reviewed."
            : d.codeChecksPassed === false
              ? "It failed the code checks, so the founder can't see it."
              : "The founder can't see it in this state."}{" "}
          Publishing an approved version replaces it for the founder.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 rounded-xl border p-6 space-y-5" style={card}>
          <div className="grid grid-cols-2 gap-4">
            {[
              { name: "Draft Agent", run: draftRun, text: "Wrote the narrative from accepted company data and approved cohort rows." },
              { name: "QA Agent", run: qaRun, text: "Separately checked the draft against the same inputs, plus code checks on every figure and source." },
            ].map((a) => (
              <div key={a.name} className="rounded-lg p-4" style={{ background: "var(--muted)" }}>
                <div className="flex items-center gap-2 mb-1 text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                  {a.name}
                  <span className="ml-auto font-normal">{runStatus(a.run)}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{a.text}</p>
                {a.run?.status === "succeeded" && a.run.durationMs != null && (
                  <p className="text-xs mt-1 font-mono" style={{ color: "var(--muted-foreground)" }}>
                    {Math.round(a.run.durationMs / 1000)}s · {a.run.tokensIn ?? 0} in / {a.run.tokensOut ?? 0} out
                  </p>
                )}
              </div>
            ))}
          </div>

          {failedRun && (
            <div className="rounded-lg border p-4 text-sm" style={{ borderColor: "var(--red)", color: "var(--red)" }}>
              {failedRun.agent === "draft" ? "Draft" : "QA"} failed: {failedRun.error}
            </div>
          )}
          {status === "stalled" && <p className="text-sm" style={{ color: "var(--red)" }}>This run didn&apos;t finish (it was probably cut off). Start a new one.</p>}

          {qa && (
            <div>
              <div className="text-xs font-semibold mb-3" style={{ color: "var(--muted-foreground)" }}>QA verification</div>
              <div className="space-y-2">
                {QA_CHECKS.map(({ key, label }) => {
                  const c = qa[key];
                  return (
                    <div key={key} className="flex items-start gap-2.5">
                      <div className="w-4 h-4 rounded-full mt-0.5 shrink-0 flex items-center justify-center text-[9px] font-bold text-white" style={{ background: c.result === "pass" ? "var(--green)" : "var(--red)" }}>
                        {c.result === "pass" ? "✓" : "!"}
                      </div>
                      <div>
                        <span className="text-sm" style={{ color: "var(--foreground)" }}>{label}</span>
                        {c.note && <div className="text-xs" style={{ color: c.result === "pass" ? "var(--muted-foreground)" : "var(--red)" }}>{c.note}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {missing.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--muted-foreground)" }}>Missing inputs flagged by the Draft Agent</div>
              <ul className="text-sm list-disc pl-5" style={{ color: "var(--foreground)" }}>{missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold mb-3" style={{ color: "var(--muted-foreground)" }}>Advisor decision</div>
            {status === "failed" || status === "stalled" ? (
              <GenerateButton companyId={company.id} label="Start a new draft" generate={generateBenchmark} />
            ) : status === "changes_requested" ? (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>A newer version replaced this one.</p>
            ) : (
              <ReviewActions deliverableId={d.id} status={status} edits={edits} approve={approve} publish={publish} sendBack={sendBack} saveEdits={saveEdits} />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border p-5" style={card}>
            <div className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>Versions</div>
            <div className="space-y-1">
              {versions.map((v) => (
                <Link key={v.id} href={`/advisor/review/${v.id}`} className="flex justify-between text-xs py-1" style={{ color: v.id === d.id ? "var(--foreground)" : "var(--muted-foreground)", fontWeight: v.id === d.id ? 600 : 400 }}>
                  <span>v{v.version}</span>
                  <span style={{ color: STATUS_LABEL[v.status]?.color }}>{STATUS_LABEL[v.status]?.label ?? v.status}</span>
                </Link>
              ))}
            </div>
          </div>
          {reviews.some((r) => r.review.decision) && (
            <div className="rounded-xl border p-5" style={card}>
              <div className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>Decisions on this version</div>
              {reviews.filter((r) => r.review.decision).map((r) => (
                <div key={r.review.id} className="text-xs mb-2" style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-semibold" style={{ color: "var(--foreground)" }}>{DECISION[r.review.decision!]}</span> by {r.reviewer ?? r.email ?? "advisor"}
                  {r.review.comment && <div>“{r.review.comment}”</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {view ? (
        <section>
          <div className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: "var(--amber)" }}>Draft preview · what the founder will see once published</div>
          <div className="rounded-xl border" style={{ borderColor: "var(--amber)" }}>
            <BenchmarkView data={view} companyName={company.name} scoreBreakdown={null} />
          </div>
        </section>
      ) : (
        status !== "failed" && status !== "stalled" && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>The preview appears once the draft is written.</p>
      )}
    </div>
  );
}
