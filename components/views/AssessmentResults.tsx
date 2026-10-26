"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SourceTrailPanel } from "@/components/SourceTrailPanel";
import type { ResultsView } from "@/lib/data/assessments";

const card = { background: "var(--card)", borderColor: "var(--border)" };

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border p-5 sm:p-6" style={card} aria-labelledby={`results-${n}`}>
      <h2 id={`results-${n}`} className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>
        {n} · {title}
      </h2>
      {children}
    </section>
  );
}

const HORIZON = { next_30_days: "Next 30 days", next_90_days: "Next 90 days", later: "Later" } as const;

/**
 * Assessment results in the order founders read them: summary, findings, evidence,
 * diagnosis, decision, actions, confidence and next steps. Every statement opens its
 * Source Trail; nothing here is computed in the browser.
 */
export function AssessmentResults({
  title,
  data,
  nextUseCase,
  advisory,
  actions,
  onSourceTrail,
}: {
  title: string;
  data: ResultsView;
  nextUseCase: { href: string; question: string } | null;
  /** The optional advisory offer, shown once at the end. */
  advisory: ReactNode;
  /** Extra controls under the header (e.g. re-run with new data). */
  actions?: ReactNode;
  onSourceTrail?: (claimKey: string) => void;
}) {
  const [openClaim, setOpenClaimState] = useState<string | null>(null);
  const open = (key: string) => {
    setOpenClaimState(key);
    onSourceTrail?.(key);
  };
  const evidence = (key: string) => (
    <button type="button" className="text-xs font-semibold shrink-0" style={{ color: "var(--green)" }} onClick={() => open(key)}>
      Evidence →
    </button>
  );
  const hasPeers = data.evidence.some((r) => r.median || r.topQuartile);
  const { confidence } = data;

  return (
    <div className="p-4 sm:p-8 max-w-5xl space-y-5">
      <SourceTrailPanel
        claim={openClaim ? (data.claims[openClaim] ?? null) : null}
        onClose={() => setOpenClaimState(null)}
        note={data.reviewed ? "Checked in code against your inputs and reviewed by your advisor." : "Checked in code against your inputs."}
      />

      <header>
        <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>Assessment results</div>
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>{title}</h1>
        {data.reviewed ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            <span style={{ color: "var(--green)" }}>✓</span> Reviewed by {data.reviewed.by ?? "your advisor"} on{" "}
            {new Date(data.reviewed.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {data.reviewed.comment && <span style={{ color: "var(--foreground)" }}>: “{data.reviewed.comment}”</span>}
          </p>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Built from your answers and data. Every figure and statement was checked against your inputs; open &ldquo;Evidence&rdquo; to see the source.
          </p>
        )}
        {actions}
      </header>

      <Section n={1} title="Executive summary">
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <p className="font-display text-xl mb-2" style={{ color: "var(--foreground)" }}>{data.summary.headline}</p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{data.summary.body}</p>
          </div>
          {evidence(data.summary.claimKey)}
        </div>
      </Section>

      <Section n={2} title="Main findings">
        <ul className="space-y-3">
          {data.findings.map((f) => (
            <li key={f.claimKey} className="flex gap-3 items-start text-sm">
              <span aria-label={f.kind === "concern" ? "Concern" : "Strength"} style={{ color: f.kind === "concern" ? "var(--amber)" : "var(--green)" }}>{f.kind === "concern" ? "▲" : "●"}</span>
              <span className="flex-1" style={{ color: "var(--foreground)" }}>{f.text}</span>
              {evidence(f.claimKey)}
            </li>
          ))}
        </ul>
      </Section>

      <Section n={3} title="Evidence and supporting metrics">
        {data.evidence.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No figures could be read from your data yet, so this assessment rests on your answers and the data you described. Adding figures (see next steps) will sharpen it.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--muted-foreground)" }}>
                  <th className="py-2 px-1 font-semibold">Metric</th>
                  <th className="py-2 px-1 font-semibold">Your figure</th>
                  {hasPeers && <th className="py-2 px-1 font-semibold">Peer median</th>}
                  {hasPeers && <th className="py-2 px-1 font-semibold">Peer top quartile</th>}
                </tr>
              </thead>
              <tbody>
                {data.evidence.map((r) => (
                  <tr key={r.label} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 px-1" style={{ color: "var(--foreground)" }}>{r.label}</td>
                    <td className="py-2.5 px-1 font-mono" style={{ color: "var(--foreground)" }}>
                      {r.value}
                      {r.unconfirmed && <div className="text-xs font-sans" style={{ color: "var(--amber)" }}>From your file · not confirmed</div>}
                    </td>
                    {hasPeers && <td className="py-2.5 px-1 font-mono" style={{ color: "var(--muted-foreground)" }}>{r.median ?? "—"}</td>}
                    {hasPeers && <td className="py-2.5 px-1 font-mono" style={{ color: "var(--muted-foreground)" }}>{r.topQuartile ?? "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>
          {data.reference
            ? `Peer reference: ${data.reference.name}${data.reference.companyCount ? ` (${data.reference.companyCount} companies)` : ""}, from approved, cited sources only.`
            : "No approved peer reference data matches your company yet, so this uses your own figures, answers and target."}
        </p>
      </Section>

      <Section n={4} title="Diagnosis and implications">
        <div className="flex gap-3 items-start">
          <p className="flex-1 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{data.diagnosis.text}</p>
          {evidence(data.diagnosis.claimKey)}
        </div>
      </Section>

      <Section n={5} title="Recommended decision">
        <div className="flex gap-3 items-start">
          <p className="flex-1 text-base font-medium" style={{ color: "var(--foreground)" }}>{data.decision.text}</p>
          {evidence(data.decision.claimKey)}
        </div>
      </Section>

      <Section n={6} title="Prioritized actions">
        <ol className="space-y-4">
          {data.actions.map((a, i) => (
            <li key={a.claimKey} className="flex gap-3 items-start text-sm">
              <span className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: "var(--muted)", color: "var(--foreground)" }}>{i + 1}</span>
              <div className="flex-1">
                <div className="font-medium" style={{ color: "var(--foreground)" }}>{a.action}</div>
                <div style={{ color: "var(--muted-foreground)" }}>{a.why}</div>
                <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                  {HORIZON[a.horizon]}
                  {a.kpi && ` · KPI: ${a.kpi}`}
                </div>
              </div>
              {evidence(a.claimKey)}
            </li>
          ))}
        </ol>
      </Section>

      <Section n={7} title="Confidence, assumptions and data limitations">
        <p className="text-sm mb-2" style={{ color: "var(--foreground)" }}>
          Confidence: <span className="font-semibold" style={{ color: confidence.level === "High" ? "var(--green)" : confidence.level === "Medium" ? "var(--amber)" : "var(--red)" }}>{confidence.level}</span>
        </p>
        <ul className="text-sm space-y-1 mb-3" style={{ color: "var(--muted-foreground)" }}>
          {confidence.reasons.map((r) => <li key={r}>• {r}</li>)}
        </ul>
        {data.assumptions.length > 0 && (
          <>
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--foreground)" }}>Assumptions</div>
            <ul className="text-sm space-y-1 mb-3" style={{ color: "var(--muted-foreground)" }}>{data.assumptions.map((a) => <li key={a}>• {a}</li>)}</ul>
          </>
        )}
        {data.dataGaps.length > 0 && (
          <>
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--foreground)" }}>Data gaps</div>
            <ul className="text-sm space-y-1 mb-3" style={{ color: "var(--muted-foreground)" }}>{data.dataGaps.map((a) => <li key={a}>• {a}</li>)}</ul>
          </>
        )}
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}><span className="font-semibold">Method: </span>{data.methodology}</p>
      </Section>

      <Section n={8} title="Suggested next steps">
        {data.nextSteps.length > 0 && (
          <ul className="space-y-1.5 mb-4 text-sm" style={{ color: "var(--foreground)" }}>
            {data.nextSteps.map((s) => <li key={s}>• {s}</li>)}
          </ul>
        )}
        {nextUseCase && (
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            When you&apos;re ready, a good next question: <Link href={nextUseCase.href} style={{ color: "var(--green)" }}>{nextUseCase.question}</Link>
          </p>
        )}
        {!data.nextSteps.length && !nextUseCase && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Nothing outstanding.</p>}
      </Section>

      {advisory}
    </div>
  );
}
