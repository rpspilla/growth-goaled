import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";

export type MetricCardData = {
  metric: MetricKey;
  value: number;
  period: string | null;
  origin: "manual" | "extracted" | "calculated";
  confirmed: boolean;
  previous: { value: number } | null;
};

const ORIGIN = { calculated: "Calculated from your data", manual: "Reported by you", extracted: "From your documents" } as const;

/** One metric: the value, where it came from, and (when there's an earlier value) which way it moved. */
export function MetricCard({ m, why }: { m: MetricCardData; why?: string }) {
  const def = METRICS[m.metric];
  const prev = m.previous;
  const better = prev ? (def.lowerIsBetter ? m.value < prev.value : m.value > prev.value) : null;
  return (
    <div className="surface p-5 flex flex-col">
      <div className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>{def.label}</div>
      <div className="text-3xl font-semibold mt-1 tracking-tight" style={{ color: "var(--foreground)" }}>{formatMetric(m.metric, m.value)}</div>
      {prev && (
        <div className="text-sm mt-1 font-medium" style={{ color: better ? "var(--green)" : "var(--red)" }}>
          {better ? "▲" : "▼"} from {formatMetric(m.metric, prev.value)}
        </div>
      )}
      <div className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>
        {m.period && m.period !== "Current" ? `${m.period} · ` : ""}
        {ORIGIN[m.origin]}
        {!m.confirmed && m.origin !== "calculated" ? " · not confirmed" : ""}
      </div>
      {why && <p className="text-sm mt-3 pt-3 border-t" style={{ color: "var(--muted-foreground)", borderColor: "var(--border)" }}>{why}</p>}
    </div>
  );
}
