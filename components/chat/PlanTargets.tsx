"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pill } from "@/components/ui/Pill";
import type { PlanTarget } from "@/lib/db/schema";
import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import { isMetricKey, MAX_TARGETS, targetMet } from "@/lib/plan-tracking";

type Save = (targets: PlanTarget[]) => Promise<{ ok: boolean; error?: string }>;
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * The plan's metric targets against the company's current figures (from its data and profile, as on
 * Performance). On a live plan the founder or advisor can add and remove them.
 */
export function PlanTargets({ targets, current, save }: { targets: PlanTarget[]; current: Record<string, number | null>; save?: Save }) {
  const [adding, setAdding] = useState(false);
  const [metric, setMetric] = useState("");
  const [value, setValue] = useState("");
  const [by, setBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (next: PlanTarget[]) =>
    start(async () => {
      setError(null);
      const r = await save!(next);
      if (!r.ok) return setError(r.error ?? "Couldn't save that.");
      setAdding(false);
      setMetric("");
      setValue("");
      setBy("");
      router.refresh();
    });
  const shown = targets.filter((t) => isMetricKey(t.metric));
  const available = (Object.keys(METRICS) as MetricKey[]).filter((k) => !shown.some((t) => t.metric === k));
  return (
    <section aria-label="Targets" className="rounded-xl p-4 space-y-3" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
      <div>
        <h4 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Targets</h4>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>The numbers this plan should move, against your latest figures.</p>
      </div>
      {shown.length === 0 && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No targets yet.</p>}
      <ul className="space-y-2">
        {shown.map((t) => {
          const key = t.metric as MetricKey;
          const now = current[key] ?? null;
          const met = targetMet(key, now, t.target);
          return (
            <li key={key} className="flex items-center gap-3 flex-wrap text-sm" style={{ color: "var(--foreground)" }}>
              <span className="font-semibold min-w-[8rem]">{METRICS[key].label}</span>
              <span style={{ color: "var(--muted-foreground)" }}>
                {now === null ? "No figure yet" : `Now ${formatMetric(key, now)}`} → target {formatMetric(key, t.target)}
                {t.by ? ` by ${day(t.by)}` : ""}
              </span>
              {met !== null && <Pill tone={met ? "green" : "amber"}>{met ? "Met" : "Not yet"}</Pill>}
              {save && (
                <button type="button" className="text-xs link ml-auto" aria-label={`Remove target: ${METRICS[key].label}`} disabled={pending} onClick={() => run(shown.filter((x) => x.metric !== key))}>
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {save && shown.length < MAX_TARGETS && (adding ? (
        <form
          aria-label="Add a target"
          className="grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value.replace(/[,$%\s]/g, ""));
            if (!metric || !Number.isFinite(n)) return setError("Pick a metric and enter a number.");
            run([...shown, { metric, target: n, by: by || null }]);
          }}
        >
          <label className="text-xs space-y-1" style={{ color: "var(--muted-foreground)" }}>
            Metric
            <select className="field w-full text-sm" value={metric} onChange={(e) => setMetric(e.target.value)} required>
              <option value="">Choose…</option>
              {available.map((k) => (
                <option key={k} value={k}>{METRICS[k].label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1" style={{ color: "var(--muted-foreground)" }}>
            Target
            <input className="field w-full text-sm" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={metric && isMetricKey(metric) ? METRICS[metric].unit : ""} required />
          </label>
          <label className="text-xs space-y-1" style={{ color: "var(--muted-foreground)" }}>
            By (optional)
            <input type="date" className="field w-full text-sm" value={by} onChange={(e) => setBy(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary text-sm" disabled={pending}>Add</button>
            <button type="button" className="text-sm link" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="text-sm link" onClick={() => setAdding(true)}>+ Add a target</button>
      ))}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </section>
  );
}
