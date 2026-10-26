"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SourceTrailPanel } from "@/components/SourceTrailPanel";
import type { ResultsView } from "@/lib/data/assessments";

const card = { background: "var(--card)", borderColor: "var(--border)" };
const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

function Section({ n, title, children, aside }: { n: number; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border p-5 sm:p-6" style={card} aria-labelledby={`brief-${n}`}>
      <div className="flex items-center gap-3 mb-3">
        <h2 id={`brief-${n}`} className="flex-1 text-xs font-semibold uppercase tracking-wider" style={muted}>
          {n} · {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "green" | "amber" | "red" | "muted" }) {
  const bg = { green: "var(--green-muted)", amber: "var(--amber-muted)", red: "var(--red-muted, #FDECEC)", muted: "var(--muted)" }[tone];
  const color = { green: "var(--green)", amber: "var(--amber)", red: "var(--red)", muted: "var(--muted-foreground)" }[tone];
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: bg, color }}>{children}</span>;
}

const TIMING = { next_30_days: "Days 1–30", days_31_60: "Days 31–60", days_61_90: "Days 61–90" } as const;
const CERTAINTY = {
  established: { label: "Established", tone: "green", note: "The calculated evidence clearly points to this explanation over the others." },
  leading: { label: "Leading explanation", tone: "amber", note: "The evidence favours this explanation, but not decisively. The test below would confirm it." },
  unresolved: { label: "Not yet established", tone: "red", note: "The data can't yet separate the possible explanations. The test below is the fastest way to tell them apart." },
} as const;
const STATUS = {
  verified: { label: "Verified", tone: "green" },
  calculated: { label: "Calculated", tone: "green" },
  inference: { label: "Inference", tone: "amber" },
  hypothesis: { label: "Hypothesis", tone: "muted" },
} as const;
const ORIGIN = { calculated: "Calculated from your file", manual: "You reported", extracted: "Read from your document" } as const;
// Lower-cases a leading capital for mid-sentence use, but leaves acronyms ("NRR", "ARR") alone.
const midSentence = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * A Decision Brief in nine sections: decision, baseline, diagnosis, evidence, alternatives,
 * recommendation, 30–90 day plan, what would change it, and follow-up. Every statement opens
 * its Source Trail; nothing here is computed in the browser.
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
  /** "Check your figures", shown after the gaps. */
  figures?: ReactNode;
  /** "Commit to this plan" (or where it's tracked), shown with the plan. */
  commit?: ReactNode;
  onSourceTrail?: (claimKey: string) => void;
}) {
  const [openClaim, setOpenClaimState] = useState<string | null>(null);
  const open = (key: string) => {
    setOpenClaimState(key);
    onSourceTrail?.(key);
  };
  const evidence = (key: string) =>
    data.claims[key] ? (
      <button type="button" className="text-xs font-semibold shrink-0" style={{ color: "var(--green)" }} onClick={() => open(key)}>
        Evidence →
      </button>
    ) : null;
  const hasPeers = data.baseline.some((r) => r.median || r.topQuartile);
  const hasPrevious = data.baseline.some((r) => r.previous);
  const certainty = data.certainty ? CERTAINTY[data.certainty] : null;
  const { confidence } = data;

  return (
    <div className="p-4 sm:p-8 max-w-5xl space-y-5">
      <SourceTrailPanel
        claim={openClaim ? (data.claims[openClaim] ?? null) : null}
        onClose={() => setOpenClaimState(null)}
        note={data.reviewed ? "Checked in code against your inputs and reviewed by your advisor." : "Checked in code against your inputs."}
      />

      <header>
        <div className="text-xs font-medium uppercase tracking-wider mb-2" style={muted}>Decision brief · version {data.version} · {date(data.builtAt)}</div>
        <h1 className="font-display text-3xl font-normal mb-2" style={fg}>{title}</h1>
        {data.reviewed ? (
          <p className="text-sm" style={muted}>
            <span style={{ color: "var(--green)" }}>✓</span> Reviewed by {data.reviewed.by ?? "your advisor"} on {date(data.reviewed.at)}
            {data.reviewed.comment && <span style={fg}>: “{data.reviewed.comment}”</span>}
          </p>
        ) : (
          <p className="text-sm" style={muted}>
            Figures are calculated in code from your data; the diagnosis is ranked by fixed rules; every statement was checked against your inputs. Open &ldquo;Evidence&rdquo; to see the source.
          </p>
        )}
        {actions}
      </header>

      {(data.degraded || data.dataGaps.length > 0) && (
        <div className="rounded-xl border p-4 text-sm" role="note" style={{ background: "var(--card)", borderColor: "var(--amber)", color: "var(--foreground)" }}>
          <div className="font-semibold mb-1">
            {data.degraded ? "A partial brief: the written analysis couldn't be completed this time" : `Built as far as your data allows · ${data.dataGaps.length} ${data.dataGaps.length === 1 ? "gap" : "gaps"}`}
          </div>
          <ul className="space-y-0.5 mb-2" style={muted}>
            {data.dataGaps.slice(0, 4).map((g) => <li key={g}>• {g}</li>)}
            {data.dataGaps.length > 4 && <li>• and {data.dataGaps.length - 4} more under section 4</li>}
          </ul>
          {reviewHref && (
            <a href={reviewHref} className="text-sm font-semibold" style={{ color: "var(--green)" }}>
              Book time with an executive advisor to review it →
            </a>
          )}
        </div>
      )}

      {figures}

      <Section n={1} title="Executive decision" aside={certainty && <Chip tone={certainty.tone}>Diagnosis: {certainty.label}</Chip>}>
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <p className="font-display text-xl mb-2" style={fg}>{data.executiveDecision.decision}</p>
            <p className="text-sm leading-relaxed" style={muted}>{data.executiveDecision.conclusion}</p>
          </div>
          {evidence(data.executiveDecision.claimKey)}
        </div>
      </Section>

      <Section n={2} title="Where you are now">
        {data.baseline.length === 0 ? (
          <p className="text-sm" style={muted}>No figures could be read from your data yet, so this brief rests on your answers and the data you described.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs" style={muted}>
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
                    <td className="py-2.5 px-1 font-mono" style={fg}>{r.value}</td>
                    <td className="py-2.5 px-1 text-xs" style={muted}>
                      {r.period && r.period !== "Current" && <div style={fg}>{r.period}</div>}
                      <div>
                        {ORIGIN[r.origin]}
                        {r.sampleSize !== null && ` · ${r.sampleSize} records`}
                      </div>
                      {r.method && <div className="mt-0.5">{r.method}</div>}
                      {!r.confirmed && <div style={{ color: "var(--amber)" }}>Not confirmed yet</div>}
                      {r.stale && <div style={{ color: "var(--amber)" }}>More than 90 days old</div>}
                    </td>
                    {hasPrevious && (
                      <td className="py-2.5 px-1 text-xs font-mono" style={muted}>
                        {r.previous ? (
                          <>
                            {r.previous.value}{" "}
                            <span style={{ color: r.previous.direction === "better" ? "var(--green)" : r.previous.direction === "worse" ? "var(--red)" : "var(--muted-foreground)" }}>
                              {r.previous.direction === "better" ? "▲ better now" : r.previous.direction === "worse" ? "▼ worse now" : "no change"}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    {hasPeers && <td className="py-2.5 px-1 font-mono text-xs" style={muted}>{r.median ?? "—"} / {r.topQuartile ?? "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs mt-3" style={muted}>
          {data.reference ? (
            <>
              Peer reference: {data.reference.name}
              {data.reference.companyCount ? ` (${data.reference.companyCount} companies)` : ""}
              {data.reference.sources.length ? `; source: ${data.reference.sources.join("; ")}` : ""}. Approved, cited reference data only.
              {data.reference.unmatched.length > 0 && ` An imperfect match: it doesn't match your company on ${data.reference.unmatched.join("; ")}, so treat the comparison as indicative.`}
            </>
          ) : (
            "No approved peer reference data matches your company yet, so this brief judges your figures against your own trend and target, not peers."
          )}
        </p>
      </Section>

      <Section n={3} title="Diagnosis">
        <div className="flex gap-3 items-start mb-3">
          <div className="flex-1">
            <p className="text-base font-semibold mb-1" style={fg}>{data.diagnosis.primary.title}</p>
            <p className="text-sm leading-relaxed" style={fg}>{data.diagnosis.primary.explanation}</p>
            {certainty && <p className="text-xs mt-2" style={muted}>{certainty.note}</p>}
          </div>
          {evidence(data.diagnosis.primary.claimKey)}
        </div>
        {data.diagnosis.howToDistinguish && (
          <p className="text-sm rounded-lg p-3 mb-3" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
            <span className="font-semibold">Fastest test: </span>
            {data.diagnosis.howToDistinguish}
          </p>
        )}
        {data.diagnosis.alternatives.length > 0 && (
          <>
            <div className="text-xs font-semibold mb-1.5" style={fg}>Other explanations considered</div>
            <ul className="space-y-2 mb-3">
              {data.diagnosis.alternatives.map((a) => (
                <li key={a.claimKey} className="flex gap-3 items-start text-sm">
                  <div className="flex-1">
                    <span className="font-medium" style={fg}>{a.title}. </span>
                    <span style={muted}>{a.assessment}</span>
                  </div>
                  {evidence(a.claimKey)}
                </li>
              ))}
            </ul>
          </>
        )}
        {data.diagnosis.unknowns.length > 0 && (
          <>
            <div className="text-xs font-semibold mb-1" style={fg}>Not known yet</div>
            <ul className="text-sm space-y-0.5" style={muted}>{data.diagnosis.unknowns.map((u) => <li key={u}>• {u}</li>)}</ul>
          </>
        )}
      </Section>

      <Section n={4} title="Evidence, assumptions and confidence">
        <ul className="space-y-2.5 mb-4">
          {data.evidence.map((e) => (
            <li key={e.claimKey} className="flex gap-3 items-start text-sm">
              <Chip tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Chip>
              <span className="flex-1" style={fg}>
                {e.text}
                {e.bearing === "contradicts" && <span className="text-xs ml-1.5" style={{ color: "var(--red)" }}>(points against the diagnosis)</span>}
              </span>
              {evidence(e.claimKey)}
            </li>
          ))}
        </ul>
        {data.analyses.length > 0 && (
          <details className="mb-4">
            <summary className="cursor-pointer text-xs font-semibold" style={fg}>Calculations from your files ({data.analyses.length})</summary>
            <div className="grid sm:grid-cols-2 gap-3 mt-2">
              {data.analyses.map((t) => (
                <div key={t.title} className="rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
                  <div className="font-semibold mb-1" style={fg}>{t.title}</div>
                  <ul className="space-y-0.5 font-mono" style={muted}>{t.rows.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              ))}
            </div>
          </details>
        )}
        <p className="text-sm mb-2" style={fg}>
          Confidence in the inputs:{" "}
          <span className="font-semibold" style={{ color: confidence.level === "High" ? "var(--green)" : confidence.level === "Medium" ? "var(--amber)" : "var(--red)" }}>{confidence.level}</span>
        </p>
        <ul className="text-sm space-y-1 mb-3" style={muted}>{confidence.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
        {data.assumptions.length > 0 && (
          <>
            <div className="text-xs font-semibold mb-1" style={fg}>Assumptions</div>
            <ul className="text-sm space-y-1 mb-3" style={muted}>{data.assumptions.map((a) => <li key={a}>• {a}</li>)}</ul>
          </>
        )}
        {data.dataGaps.length > 0 && (
          <>
            <div className="text-xs font-semibold mb-1" style={fg}>Data gaps</div>
            <ul className="text-sm space-y-1 mb-3" style={muted}>{data.dataGaps.map((a) => <li key={a}>• {a}</li>)}</ul>
          </>
        )}
        <p className="text-xs" style={muted}><span className="font-semibold">Method: </span>{data.methodology}</p>
      </Section>

      <Section n={5} title="Options">
        {data.alternatives.length === 0 ? (
          <p className="text-sm" style={muted}>No alternatives were set out in this version of the brief.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.alternatives.map((a) => (
              <div key={a.claimKey} className="rounded-lg border p-4 text-sm" style={{ borderColor: "var(--border)" }}>
                <div className="flex gap-2 items-start mb-2">
                  <div className="flex-1 font-semibold" style={fg}>{a.option}</div>
                  {evidence(a.claimKey)}
                </div>
                <dl className="space-y-1.5" style={muted}>
                  <div><dt className="inline font-medium" style={{ color: "var(--green)" }}>Upside: </dt><dd className="inline">{a.upside}</dd></div>
                  <div><dt className="inline font-medium" style={{ color: "var(--red)" }}>Downside: </dt><dd className="inline">{a.downside}</dd></div>
                  <div><dt className="inline font-medium" style={fg}>What it means: </dt><dd className="inline">{a.implications}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section n={6} title="Recommendation">
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <p className="text-base font-semibold mb-1" style={fg}>{data.recommendation.option}</p>
            {data.recommendation.why && <p className="text-sm leading-relaxed" style={muted}>{data.recommendation.why}</p>}
          </div>
          {evidence(data.recommendation.claimKey)}
        </div>
      </Section>

      <Section n={7} title="30–90 day plan">
        <ol className="space-y-4 mb-4">
          {data.plan.map((a) => (
            <li key={a.claimKey} className="flex gap-3 items-start text-sm">
              <span className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: "var(--muted)", color: "var(--foreground)" }}>{a.priority}</span>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium" style={fg}>{a.action}</span>
                  <Chip>{TIMING[a.timing]}</Chip>
                </div>
                <div style={muted}>{a.rationale}</div>
                <div className="text-xs space-y-0.5" style={muted}>
                  <div><span className="font-medium" style={fg}>Who: </span>{a.role ?? "Your call: the brief doesn't assign an owner"}</div>
                  {a.successMetric && <div><span className="font-medium" style={fg}>Measure: </span>{a.successMetric}{a.metricLabel ? ` (tracked: ${a.metricLabel})` : ""}</div>}
                  {a.expectedSignal && <div><span className="font-medium" style={fg}>Signal to look for (proposed): </span>{a.expectedSignal}</div>}
                  {a.dependenciesRisks && <div><span className="font-medium" style={fg}>Depends on / risks: </span>{a.dependenciesRisks}</div>}
                </div>
              </div>
              {evidence(a.claimKey)}
            </li>
          ))}
        </ol>
        {commit}
      </Section>

      <Section n={8} title="What would change this recommendation">
        {data.changeTriggers.length === 0 ? (
          <p className="text-sm" style={muted}>New data that changes the diagnosis in section 3. Reassess when it arrives.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.changeTriggers.map((t) => (
              <li key={t.ifThis} style={fg}>
                <span className="font-medium">If {midSentence(t.ifThis.replace(/^if\s+/i, ""))}</span>
                <span style={muted}> → {t.thenThis}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section n={9} title="Follow-up">
        {data.followUp.metrics.length > 0 && (
          <ul className="space-y-1 mb-3 text-sm">
            {data.followUp.metrics.map((m) => (
              <li key={m.label} style={fg}>
                <span className="font-medium">{m.label}</span>
                <span style={muted}> · {m.why}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm mb-1" style={fg}>
          Revisit by <span className="font-semibold">{date(data.followUp.revisitBy)}</span> ({data.followUp.revisitInDays} days)
          {data.followUp.revisitTrigger && <span style={muted}>, or sooner if {midSentence(data.followUp.revisitTrigger.replace(/^(revisit )?(sooner )?(if )?/i, "").replace(/\.$/, ""))}.</span>}
        </p>
        {nextUseCase && (
          <p className="text-sm mt-3" style={fg}>
            A good next question: <Link href={nextUseCase.href} style={{ color: "var(--green)" }}>{nextUseCase.question}</Link>
          </p>
        )}
      </Section>

      {advisory}
    </div>
  );
}
