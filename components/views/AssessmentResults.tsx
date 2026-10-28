"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SourceTrailPanel } from "@/components/SourceTrailPanel";
import { BenchmarkComparisons } from "@/components/benchmarks/BenchmarkComparisonCard";
import { Pill, type Tone } from "@/components/ui/Pill";
import type { ResultsView } from "@/lib/data/assessments";

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

const TIMING = { next_30_days: "Days 1–30", days_31_60: "Days 31–60", days_61_90: "Days 61–90" } as const;
const CERTAINTY: Record<string, { label: string; tone: Tone; note: string }> = {
  established: { label: "Established", tone: "green", note: "Your calculated figures clearly point to this explanation over the others." },
  leading: { label: "Most likely", tone: "amber", note: "The evidence favours this explanation, but not decisively. The test below would confirm it." },
  unresolved: { label: "Not yet established", tone: "red", note: "Your data can't yet separate the possible explanations. The test below is the fastest way to tell them apart." },
};
/** What kind of statement each piece of evidence is, so a hypothesis never reads like a fact. */
const KIND: Record<string, { label: string; tone: Tone }> = {
  verified: { label: "Your data", tone: "green" },
  calculated: { label: "Calculated", tone: "green" },
  inference: { label: "Interpretation", tone: "blue" },
  hypothesis: { label: "Hypothesis · to validate", tone: "amber" },
};
const ORIGIN = { calculated: "Calculated from your file", manual: "Reported by you", extracted: "Read from your document" } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
// Lower-cases a leading capital for mid-sentence use, but leaves acronyms ("NRR", "ARR") alone.
const midSentence = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

function Block({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div>
        <h2 id={id} className="text-xl sm:text-2xl font-semibold" style={{ ...fg, letterSpacing: "-0.01em" }}>{title}</h2>
        {lead && <p className="text-base mt-1" style={muted}>{lead}</p>}
      </div>
      {children}
    </section>
  );
}

function Detail({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details className="disclosure surface p-5">
      <summary className="text-base">
        {title}
        {count !== undefined && <span className="font-normal" style={muted}> · {count}</span>}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

/**
 * A Decision Brief, in the order a founder reads it: the answer, why it matters, what the evidence
 * shows, what to do next, then everything else on demand. All nine parts of the brief are here;
 * the long ones open when asked. Every statement opens its Source Trail.
 */
export function AssessmentResults({
  title,
  data,
  nextUseCase,
  advisory,
  actions,
  reviewHref,
  figures,
  commit,
  peers,
  onSourceTrail,
}: {
  title: string;
  data: ResultsView;
  nextUseCase: { href: string; question: string } | null;
  /** The optional advisory offer, shown once at the end. */
  advisory: ReactNode;
  /** Extra controls under the header (e.g. re-run with new data). */
  actions?: ReactNode;
  /** Booking link for an advisor review, shown with the gaps when there are any. */
  reviewHref?: string;
  /** "Check your figures", shown with the evidence. */
  figures?: ReactNode;
  /** "Commit to this plan" (or where it's tracked), shown with the plan. */
  commit?: ReactNode;
  /** Growth, retention and revenue against peers (or the standard reference), shown with the evidence. */
  peers?: ReactNode;
  onSourceTrail?: (claimKey: string) => void;
}) {
  const [openClaim, setOpenClaimState] = useState<string | null>(null);
  const open = (key: string) => {
    setOpenClaimState(key);
    onSourceTrail?.(key);
  };
  const evidence = (key: string) =>
    data.claims[key] ? (
      <button type="button" className="btn-ghost text-sm font-semibold shrink-0" onClick={() => open(key)}>
        Evidence →
      </button>
    ) : null;
  const certainty = data.certainty ? CERTAINTY[data.certainty] : null;
  const { confidence } = data;
  const confTone: Tone = confidence.level === "High" ? "green" : confidence.level === "Medium" ? "amber" : "red";
  const first = data.plan[0];
  const keyFigures = data.baseline.slice(0, 4);
  const hasPeers = data.baseline.some((r) => r.median || r.topQuartile);
  const hasPrevious = data.baseline.some((r) => r.previous);
  const against = data.evidence.filter((e) => e.bearing === "contradicts");
  const forIt = data.evidence.filter((e) => e.bearing !== "contradicts");

  return (
    <div className="px-4 sm:px-8 py-8 max-w-5xl space-y-12">
      <SourceTrailPanel
        claim={openClaim ? (data.claims[openClaim] ?? null) : null}
        onClose={() => setOpenClaimState(null)}
        note={data.reviewed ? "Checked in code against your inputs and reviewed by your advisor." : "Checked in code against your inputs."}
      />

      <header>
        <div className="label mb-2">Decision brief · version {data.version} · {date(data.builtAt)}</div>
        <h1 className="font-display text-2xl sm:text-3xl" style={fg}>{title}</h1>
        <p className="text-sm mt-2" style={muted}>
          {data.reviewed ? (
            <>
              <span style={{ color: "var(--green)" }}>✓</span> Reviewed by {data.reviewed.by ?? "your advisor"} on {date(data.reviewed.at)}
              {data.reviewed.comment && <span style={fg}>: “{data.reviewed.comment}”</span>}
            </>
          ) : (
            "Figures are calculated from your data and every statement was checked against your inputs. Open “Evidence” to see the source."
          )}
        </p>
        {actions}
      </header>

      {/* 1. The answer */}
      <section aria-labelledby="the-answer" className="surface p-6 sm:p-8 -mt-4" style={{ borderColor: "var(--green)", boxShadow: "0 0 0 1px var(--green)" }}>
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <h2 id="the-answer" className="label" style={{ color: "var(--green)" }}>The answer</h2>
          {certainty && <Pill tone={certainty.tone}>Diagnosis: {certainty.label}</Pill>}
          <Pill tone={confTone}>Confidence in your inputs: {confidence.level}</Pill>
        </div>
        <div className="flex gap-4 items-start">
          <p className="flex-1 font-display text-3xl sm:text-4xl leading-tight" style={fg}>{data.executiveDecision.decision}</p>
          {evidence(data.executiveDecision.claimKey)}
        </div>
        <p className="text-lg mt-4 max-w-3xl" style={muted}>{data.executiveDecision.conclusion}</p>
        {first && (
          <div className="mt-6 rounded-xl px-5 py-4 flex gap-3 items-start" style={{ background: "var(--muted)" }}>
            <span className="text-sm font-bold shrink-0 mt-0.5" style={{ color: "var(--green)" }}>Do first</span>
            <span className="text-base font-medium flex-1" style={fg}>{first.action}</span>
            <span className="text-sm whitespace-nowrap" style={muted}>{TIMING[first.timing]}</span>
          </div>
        )}
      </section>

      {(data.degraded || data.dataGaps.length > 0) && (
        <div className="rounded-xl px-5 py-4 -mt-6" role="note" style={{ background: "var(--amber-muted)" }}>
          <div className="text-base font-semibold" style={{ color: "#78350F" }}>
            {data.degraded ? "A partial brief: the full analysis couldn't be completed this time." : `Built as far as your data allows: ${data.dataGaps.length} ${data.dataGaps.length === 1 ? "gap" : "gaps"} limit how far it goes.`}
          </div>
          <ul className="text-sm mt-1.5 space-y-0.5" style={{ color: "#78350F" }}>
            {data.dataGaps.slice(0, 3).map((g) => <li key={g}>• {g}</li>)}
            {data.dataGaps.length > 3 && <li>• and {data.dataGaps.length - 3} more under “Assumptions, gaps and method”</li>}
          </ul>
          {reviewHref && <a href={reviewHref} className="inline-block mt-2 text-sm font-semibold underline" style={{ color: "#78350F" }}>Book time with an executive advisor to review it →</a>}
        </div>
      )}


      {/* 2. Why it matters */}
      <Block id="why" title="Why it matters">
        <div className="surface p-6">
          <div className="flex gap-4 items-start">
            <div className="flex-1">
              <div className="text-lg font-semibold" style={fg}>{data.diagnosis.primary.title}</div>
              <p className="text-base mt-1.5" style={fg}>{data.diagnosis.primary.explanation}</p>
            </div>
            {evidence(data.diagnosis.primary.claimKey)}
          </div>
          {certainty && <p className="text-sm mt-3" style={muted}>{certainty.note}</p>}
          {data.diagnosis.howToDistinguish && (
            <p className="text-base mt-4 rounded-lg px-4 py-3" style={{ background: "var(--muted)", ...fg }}>
              <span className="font-semibold">Fastest test: </span>
              {data.diagnosis.howToDistinguish}
            </p>
          )}
          <div className="mt-5 pt-5 border-t flex gap-4 items-start" style={{ borderColor: "var(--border)" }}>
            <div className="flex-1">
              <div className="label">Recommendation</div>
              <div className="text-base font-semibold mt-0.5" style={fg}>{data.recommendation.option}</div>
              {data.recommendation.why && <p className="text-base mt-1" style={muted}>{data.recommendation.why}</p>}
            </div>
            {evidence(data.recommendation.claimKey)}
          </div>
        </div>
      </Block>

      {/* 3. What the evidence shows */}
      <Block id="evidence" title="What the evidence shows">
        {keyFigures.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {keyFigures.map((r) => (
              <div key={r.metric} className="surface p-4">
                <div className="text-sm font-semibold" style={muted}>{r.label}</div>
                <div className="text-2xl font-semibold mt-0.5" style={fg}>{r.value}</div>
                <div className="text-sm mt-1" style={muted}>{r.period && r.period !== "Current" ? `${r.period} · ` : ""}{ORIGIN[r.origin]}</div>
                {(!r.confirmed || r.stale) && <div className="text-sm mt-0.5" style={{ color: "var(--amber)" }}>{!r.confirmed ? "Not confirmed yet" : "Over 90 days old"}</div>}
                {r.previous && (
                  <div className="text-sm mt-0.5" style={{ color: r.previous.direction === "better" ? "var(--green)" : r.previous.direction === "worse" ? "var(--red)" : "var(--muted-foreground)" }}>
                    {r.previous.direction === "better" ? "▲" : r.previous.direction === "worse" ? "▼" : "="} last brief {r.previous.value}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <ul className="surface divide-y" style={{ borderColor: "var(--border)" }}>
          {forIt.map((e) => (
            <li key={e.claimKey} className="p-4 sm:px-5 flex gap-3 items-start flex-wrap sm:flex-nowrap" style={{ borderColor: "var(--border)" }}>
              <Pill tone={KIND[e.status]!.tone}>{KIND[e.status]!.label}</Pill>
              <span className="flex-1 text-base min-w-0" style={fg}>{e.text}</span>
              {evidence(e.claimKey)}
            </li>
          ))}
          {against.map((e) => (
            <li key={e.claimKey} className="p-4 sm:px-5 flex gap-3 items-start flex-wrap sm:flex-nowrap" style={{ borderColor: "var(--border)" }}>
              <Pill tone="red">Points against</Pill>
              <span className="flex-1 text-base min-w-0" style={fg}>{e.text}</span>
              {evidence(e.claimKey)}
            </li>
          ))}
        </ul>
        {data.benchmarks.length > 0 || data.benchmarkGaps.length > 0 ? (
          <BenchmarkComparisons comparisons={data.benchmarks} gaps={data.benchmarkGaps} />
        ) : data.reference ? (
          <p className="text-sm" style={muted}>
            Peer reference: {data.reference.name}
            {data.reference.companyCount ? ` (${data.reference.companyCount} companies)` : ""}
            {data.reference.sources.length ? `; source: ${data.reference.sources.join("; ")}` : ""}. Approved, cited reference data only.
          </p>
        ) : (
          <p className="text-sm" style={muted}>No sufficiently relevant published benchmark matches your company yet, so this judges your figures against your own trend and target, not peers.</p>
        )}
        {peers}
        {figures}
      </Block>

      {/* 4. What to do next */}
      <Block id="plan" title="What to do next" lead="Your 30–90 day plan, most important first. Targets and signals are our proposals; owners are your call.">
        <ol className="surface divide-y" style={{ borderColor: "var(--border)" }}>
          {data.plan.map((a) => (
            <li key={a.claimKey} className="p-5" style={{ borderColor: "var(--border)" }}>
              <div className="flex gap-4 items-start">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: a.priority === 1 ? "var(--green)" : "var(--muted)", color: a.priority === 1 ? "#fff" : "var(--foreground)" }}>{a.priority}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold" style={fg}>{a.action}</span>
                    <Pill>{TIMING[a.timing]}</Pill>
                  </div>
                  <p className="text-base mt-1" style={muted}>{a.rationale}</p>
                  <details className="disclosure mt-2">
                    <summary className="text-sm" style={{ color: "var(--green)" }}>Measure, owner and risks</summary>
                    <dl className="grid sm:grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm mt-2">
                      <dt className="font-semibold" style={fg}>Who</dt>
                      <dd style={muted}>{a.role ?? "Your call: the brief doesn't assign an owner"}</dd>
                      {a.successMetric && (<><dt className="font-semibold" style={fg}>Measure</dt><dd style={muted}>{a.successMetric}{a.metricLabel ? ` (tracked: ${a.metricLabel})` : ""}</dd></>)}
                      {a.expectedSignal && (<><dt className="font-semibold" style={fg}>Signal to look for</dt><dd style={muted}>{a.expectedSignal} <span className="italic">(proposed)</span></dd></>)}
                      {a.dependenciesRisks && (<><dt className="font-semibold" style={fg}>Depends on / risks</dt><dd style={muted}>{a.dependenciesRisks}</dd></>)}
                    </dl>
                  </details>
                </div>
                {evidence(a.claimKey)}
              </div>
            </li>
          ))}
        </ol>
        {commit}
      </Block>

      {/* 5. Explore the details */}
      <Block id="details" title="Explore the details">
        <div className="space-y-3">
          <Detail title="Options considered" count={data.alternatives.length}>
            {data.alternatives.length === 0 ? (
              <p className="text-base" style={muted}>No alternatives were set out in this version of the brief.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {data.alternatives.map((a) => (
                  <div key={a.claimKey} className="rounded-xl border p-4 text-base" style={{ borderColor: "var(--border)" }}>
                    <div className="flex gap-2 items-start mb-2">
                      <div className="flex-1 font-semibold" style={fg}>{a.option}</div>
                      {evidence(a.claimKey)}
                    </div>
                    <dl className="space-y-1.5 text-sm" style={muted}>
                      <div><dt className="inline font-semibold" style={{ color: "var(--green)" }}>Upside: </dt><dd className="inline">{a.upside}</dd></div>
                      <div><dt className="inline font-semibold" style={{ color: "var(--red)" }}>Downside: </dt><dd className="inline">{a.downside}</dd></div>
                      <div><dt className="inline font-semibold" style={fg}>What it means: </dt><dd className="inline">{a.implications}</dd></div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </Detail>

          <Detail title="Other explanations and what isn't known yet" count={data.diagnosis.alternatives.length + data.diagnosis.unknowns.length}>
            {data.diagnosis.alternatives.length > 0 && (
              <ul className="space-y-3 mb-4">
                {data.diagnosis.alternatives.map((a) => (
                  <li key={a.claimKey} className="flex gap-3 items-start text-base">
                    <div className="flex-1"><span className="font-semibold" style={fg}>{a.title}. </span><span style={muted}>{a.assessment}</span></div>
                    {evidence(a.claimKey)}
                  </li>
                ))}
              </ul>
            )}
            {data.diagnosis.unknowns.length > 0 ? (
              <>
                <div className="label mb-1">Not known yet</div>
                <ul className="text-base space-y-1" style={muted}>{data.diagnosis.unknowns.map((u) => <li key={u}>• {u}</li>)}</ul>
              </>
            ) : (
              data.diagnosis.alternatives.length === 0 && <p className="text-base" style={muted}>Nothing else to report.</p>
            )}
          </Detail>

          <Detail title="What would change this recommendation" count={data.changeTriggers.length}>
            {data.changeTriggers.length === 0 ? (
              <p className="text-base" style={muted}>New data that changes the diagnosis. Reassess when it arrives.</p>
            ) : (
              <ul className="space-y-2 text-base">
                {data.changeTriggers.map((t) => (
                  <li key={t.ifThis} style={fg}>
                    <span className="font-semibold">If {midSentence(t.ifThis.replace(/^if\s+/i, ""))}</span>
                    <span style={muted}> → {t.thenThis}</span>
                  </li>
                ))}
              </ul>
            )}
          </Detail>

          <Detail title="Follow-up and when to reassess">
            {data.followUp.metrics.length > 0 && (
              <ul className="space-y-1 mb-3 text-base">
                {data.followUp.metrics.map((m) => (
                  <li key={m.label} style={fg}><span className="font-semibold">{m.label}</span><span style={muted}> · {m.why}</span></li>
                ))}
              </ul>
            )}
            <p className="text-base" style={fg}>
              Revisit by <span className="font-semibold">{date(data.followUp.revisitBy)}</span> ({data.followUp.revisitInDays} days)
              {data.followUp.revisitTrigger && <span style={muted}>, or sooner if {midSentence(data.followUp.revisitTrigger.replace(/^(revisit )?(sooner )?(if )?/i, "").replace(/\.$/, ""))}.</span>}
            </p>
          </Detail>

          <Detail title="All your figures" count={data.baseline.length}>
            {data.baseline.length === 0 ? (
              <p className="text-base" style={muted}>No figures could be read from your data yet, so this brief rests on your answers and the data you described.</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left" style={muted}>
                      <th className="py-2 px-1 font-semibold">Metric</th>
                      <th className="py-2 px-1 font-semibold">Value</th>
                      <th className="py-2 px-1 font-semibold">Period and source</th>
                      {hasPrevious && <th className="py-2 px-1 font-semibold">Last brief</th>}
                      {hasPeers && <th className="py-2 px-1 font-semibold">Peers (median / top quartile)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.baseline.map((r) => (
                      <tr key={r.metric} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                        <td className="py-2.5 px-1" style={fg}>{r.label}</td>
                        <td className="py-2.5 px-1 font-semibold" style={fg}>{r.value}</td>
                        <td className="py-2.5 px-1" style={muted}>
                          {r.period && r.period !== "Current" && <div style={fg}>{r.period}</div>}
                          <div>{ORIGIN[r.origin]}{r.sampleSize !== null && ` · ${r.sampleSize} records`}</div>
                          {r.method && <div className="mt-0.5">{r.method}</div>}
                          {!r.confirmed && <div style={{ color: "var(--amber)" }}>Not confirmed yet</div>}
                          {r.stale && <div style={{ color: "var(--amber)" }}>More than 90 days old</div>}
                        </td>
                        {hasPrevious && (
                          <td className="py-2.5 px-1" style={muted}>
                            {r.previous ? `${r.previous.value} (${r.previous.direction === "better" ? "better now" : r.previous.direction === "worse" ? "worse now" : "no change"})` : "—"}
                          </td>
                        )}
                        {hasPeers && <td className="py-2.5 px-1" style={muted}>{r.median ?? "—"} / {r.topQuartile ?? "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Detail>

          {data.analyses.length > 0 && (
            <Detail title="Calculations from your files" count={data.analyses.length}>
              <div className="grid sm:grid-cols-2 gap-3">
                {data.analyses.map((t) => (
                  <div key={t.title} className="rounded-lg border p-4 text-sm" style={{ borderColor: "var(--border)" }}>
                    <div className="font-semibold mb-1.5" style={fg}>{t.title}</div>
                    <ul className="space-y-0.5 font-mono" style={muted}>{t.rows.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                ))}
              </div>
            </Detail>
          )}

          <Detail title="Assumptions, gaps and method">
            <div className="label mb-1">Confidence in your inputs: {confidence.level}</div>
            <ul className="text-base space-y-1 mb-4" style={muted}>{confidence.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
            {data.assumptions.length > 0 && (
              <>
                <div className="label mb-1">Assumptions</div>
                <ul className="text-base space-y-1 mb-4" style={muted}>{data.assumptions.map((a) => <li key={a}>• {a}</li>)}</ul>
              </>
            )}
            {data.dataGaps.length > 0 && (
              <>
                <div className="label mb-1">Data gaps</div>
                <ul className="text-base space-y-1 mb-4" style={muted}>{data.dataGaps.map((a) => <li key={a}>• {a}</li>)}</ul>
              </>
            )}
            <p className="text-sm" style={muted}><span className="font-semibold">Method: </span>{data.methodology}</p>
          </Detail>
        </div>
        {nextUseCase && (
          <p className="text-base" style={fg}>
            A good next question: <Link href={nextUseCase.href} className="link">{nextUseCase.question}</Link>
          </p>
        )}
      </Block>

      {advisory}
    </div>
  );
}
