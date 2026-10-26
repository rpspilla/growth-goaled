"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SourceTrailPanel } from "@/components/SourceTrailPanel";
import type { BenchmarkView } from "@/lib/data/benchmark";
import type { CompletionStep } from "@/lib/completion";
import type { Confidence } from "@/lib/use-cases/results";

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

/**
 * Assessment results in the order founders read them: summary, findings, evidence,
 * diagnosis, decision, actions, confidence and next steps. Every finding opens its
 * Source Trail; nothing here is computed in the browser.
 */
export function AssessmentResults({
  title,
  data,
  preliminary,
  confidence,
  steps,
  nextUseCase,
  advisory,
  onSourceTrail,
}: {
  title: string;
  data: BenchmarkView;
  preliminary: boolean;
  confidence: Confidence;
  steps: CompletionStep[];
  nextUseCase: { href: string; question: string } | null;
  /** The optional advisory offer, shown once at the end. */
  advisory: ReactNode;
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
  const hasPeers = data.rows.some((r) => r.median || r.topQuartile);

  return (
    <div className="p-4 sm:p-8 max-w-5xl space-y-5">
      <SourceTrailPanel claim={openClaim ? (data.claims[openClaim] ?? null) : null} onClose={() => setOpenClaimState(null)} />

      <header>
        <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>Assessment results</div>
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>{title}</h1>
        {preliminary ? (
          <p className="text-sm inline-flex items-center gap-2 flex-wrap" style={{ color: "var(--foreground)" }}>
            <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: "var(--amber-muted)", color: "var(--amber)" }}>Preliminary</span>
            Built from your data and checked in code. An analyst reviews it next; the reviewed version replaces this one.
          </p>
        ) : data.approval ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            <span style={{ color: "var(--green)" }}>✓</span> Reviewed by {data.approval.reviewerName ?? "your analyst"} on{" "}
            {new Date(data.approval.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {data.approval.comment && <span style={{ color: "var(--foreground)" }}>: “{data.approval.comment}”</span>}
          </p>
        ) : null}
      </header>

      <Section n={1} title="Executive summary">
        <p className="font-display text-xl mb-2" style={{ color: "var(--foreground)" }}>{data.headline ?? data.insight.headline}</p>
        {data.headline && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{data.insight.headline}</p>}
      </Section>

      <Section n={2} title="Main findings">
        <ul className="space-y-3">
          {data.summary.watchAreas.map((f) => (
            <li key={f.claimKey} className="flex gap-3 items-start text-sm">
              <span aria-label="Concern" style={{ color: "var(--amber)" }}>▲</span>
              <span className="flex-1" style={{ color: "var(--foreground)" }}>{f.text}</span>
              {evidence(f.claimKey)}
            </li>
          ))}
          {data.summary.strengths.map((f) => (
            <li key={f.claimKey} className="flex gap-3 items-start text-sm">
              <span aria-label="Strength" style={{ color: "var(--green)" }}>●</span>
              <span className="flex-1" style={{ color: "var(--foreground)" }}>{f.text}</span>
              {evidence(f.claimKey)}
            </li>
          ))}
        </ul>
      </Section>

      <Section n={3} title="Evidence and supporting metrics">
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--muted-foreground)" }}>
                <th className="py-2 px-1 font-semibold">Metric</th>
                <th className="py-2 px-1 font-semibold">Your figure</th>
                {hasPeers && <th className="py-2 px-1 font-semibold">Peer median</th>}
                {hasPeers && <th className="py-2 px-1 font-semibold">Peer top quartile</th>}
                <th className="py-2 px-1"><span className="sr-only">Source</span></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.metric} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 px-1" style={{ color: "var(--foreground)" }}>{r.label}</td>
                  <td className="py-2.5 px-1 font-mono" style={{ color: "var(--foreground)" }}>
                    {r.value}
                    {r.unconfirmed && <div className="text-xs font-sans" style={{ color: "var(--amber)" }}>From your file · not confirmed</div>}
                  </td>
                  {hasPeers && <td className="py-2.5 px-1 font-mono" style={{ color: "var(--muted-foreground)" }}>{r.median ?? "—"}</td>}
                  {hasPeers && <td className="py-2.5 px-1 font-mono" style={{ color: "var(--muted-foreground)" }}>{r.topQuartile}</td>}
                  <td className="py-2.5 px-1 text-right">{evidence(r.claimKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasPeers && (
          <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>
            Peer reference: {data.cohort.name}
            {data.cohort.companyCount ? ` (${data.cohort.companyCount} companies)` : ""}, from approved, cited sources only.
          </p>
        )}
      </Section>

      <Section n={4} title="Diagnosis and implications">
        <p className="text-sm leading-relaxed mb-2" style={{ color: "var(--foreground)" }}>{data.insight.body}</p>
        {evidence(data.insight.claimKey)}
      </Section>

      <Section n={5} title="Recommended decision">
        <div className="flex gap-3 items-start">
          <p className="flex-1 text-base font-medium" style={{ color: "var(--foreground)" }}>{data.summary.priority.text}</p>
          {evidence(data.summary.priority.claimKey)}
        </div>
      </Section>

      <Section n={6} title="Prioritized actions">
        <ol className="space-y-2 text-sm list-decimal pl-5" style={{ color: "var(--foreground)" }}>
          <li>{data.summary.priority.text}</li>
          {data.summary.watchAreas.map((w) => <li key={w.claimKey}>Look into: {w.text}</li>)}
        </ol>
      </Section>

      <Section n={7} title="Confidence, assumptions and data limitations">
        <p className="text-sm mb-2" style={{ color: "var(--foreground)" }}>
          Confidence: <span className="font-semibold" style={{ color: confidence.level === "High" ? "var(--green)" : confidence.level === "Medium" ? "var(--amber)" : "var(--red)" }}>{confidence.level}</span>
        </p>
        <ul className="text-sm space-y-1 mb-3" style={{ color: "var(--muted-foreground)" }}>
          {confidence.reasons.map((r) => <li key={r}>• {r}</li>)}
        </ul>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}><span className="font-semibold">Method: </span>{data.methodology}</p>
      </Section>

      <Section n={8} title="Suggested next steps">
        {steps.length > 0 && (
          <ul className="space-y-3 mb-4">
            {steps.map((s) => (
              <li key={s.title} className="text-sm">
                <div className="font-medium" style={{ color: "var(--foreground)" }}>{s.title}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{s.detail}</div>
                <Link href={s.href} className="text-xs font-semibold" style={{ color: "var(--green)" }}>{s.label} →</Link>
              </li>
            ))}
          </ul>
        )}
        {nextUseCase && (
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            When you&apos;re ready, a good next question: <Link href={nextUseCase.href} style={{ color: "var(--green)" }}>{nextUseCase.question}</Link>
          </p>
        )}
        {!steps.length && !nextUseCase && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Nothing outstanding.</p>}
      </Section>

      {advisory}
    </div>
  );
}
