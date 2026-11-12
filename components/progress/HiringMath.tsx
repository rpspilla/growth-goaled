import { AlertTriangle } from "lucide-react";
import type { HiringResult } from "@/lib/hiring-plan";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const SOURCE: Record<string, string> = { "your answer": "Your answer", "your target": "Your target", default: "Default", "your data": "Your data", calculated: "Calculated" };

/**
 * The Growth Hiring Plan's numbers, worked out in code from the six inputs: the leaky-bucket check
 * first, then the quota recommendation and the pipeline the new AE must generate, with every formula
 * and input in the Source Trail. Nothing is guessed: missing inputs are listed.
 */
export function HiringMath({ result }: { result: HiringResult }) {
  const n = result.numbers;
  return (
    <section aria-label="Hiring plan numbers" className="surface p-5 space-y-4">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>Your hiring numbers</h2>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Worked out from your six inputs. Your revenue target is your figure, not our analysis.</p>
      </div>
      {result.leakyBucket && (
        <p role="alert" className="rounded-lg px-4 py-3 text-sm flex gap-2 items-start" style={{ background: "var(--amber-muted)", color: "var(--foreground)" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: "var(--amber)" }} aria-hidden />
          <span>
            <strong>Check retention first.</strong> {result.leakyBucket}
          </span>
        </p>
      )}
      {result.problems.map((p) => (
        <p key={p} role="alert" className="text-sm" style={{ color: "var(--red)" }}>
          {p}
        </p>
      ))}
      {n && (
        <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl p-4" style={{ background: "var(--muted)" }}>
            <dt className="text-sm" style={{ color: "var(--muted-foreground)" }}>Quota recommendation for the new AE</dt>
            <dd className="text-2xl font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
              {usd(n.quota)}
              <span className="text-sm font-normal" style={{ color: "var(--muted-foreground)" }}> a year</span>
            </dd>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--muted)" }}>
            <dt className="text-sm" style={{ color: "var(--muted-foreground)" }}>Pipeline needed per month</dt>
            <dd className="text-2xl font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>{usd(n.pipelinePerMonth)}</dd>
            <dd className="text-xs" style={{ color: "var(--muted-foreground)" }}>starting by {n.pipelineStartBy}</dd>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--muted)" }}>
            <dt className="text-sm" style={{ color: "var(--muted-foreground)" }}>Pipeline coverage</dt>
            <dd className="text-2xl font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>{Math.round(n.coverage * 10) / 10}x</dd>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--muted)" }}>
            <dt className="text-sm" style={{ color: "var(--muted-foreground)" }}>Deals a month</dt>
            <dd className="text-2xl font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>{n.dealsPerMonth === null ? "—" : Math.round(n.dealsPerMonth * 10) / 10}</dd>
          </div>
        </dl>
      )}
      {result.missing.length > 0 && (
        <div className="text-sm" style={{ color: "var(--foreground)" }}>
          <div className="font-semibold">Still missing{n ? "" : ", so the numbers can't be worked out yet"}:</div>
          <ul className="list-disc pl-5" aria-label="Missing inputs">
            {result.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {result.trail.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold link">Source Trail: how these are worked out</summary>
          <ol aria-label="Source Trail" className="mt-3 space-y-3">
            {result.trail.map((t) => (
              <li key={t.label} className="rounded-lg p-3" style={{ border: "1px solid var(--border)" }}>
                <div className="font-semibold" style={{ color: "var(--foreground)" }}>
                  {t.label}: {t.result}
                </div>
                <div className="text-xs font-mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>{t.formula}</div>
                <ul className="mt-1.5 space-y-0.5">
                  {t.inputs.map((i) => (
                    <li key={i.label} className="text-xs" style={{ color: "var(--foreground)" }}>
                      {i.label}: <strong>{i.value}</strong> <span style={{ color: "var(--muted-foreground)" }}>· {SOURCE[i.source]}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
