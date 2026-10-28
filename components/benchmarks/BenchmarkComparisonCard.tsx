import type { BenchmarkComparison } from "@/lib/benchmark-library/compare";

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };

function Kind({ children, tone }: { children: string; tone: "observed" | "benchmark" | "derived" | "interpretation" }) {
  const style = {
    observed: { background: "var(--green-muted)", color: "var(--green)" },
    benchmark: { background: "var(--muted)", color: "var(--foreground)" },
    derived: { background: "var(--amber-muted)", color: "var(--amber)" },
    interpretation: { background: "var(--muted)", color: "var(--muted-foreground)" },
  }[tone];
  return <span className="text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap" style={style}>{children}</span>;
}

/**
 * One benchmark comparison as customers see it (and as admins preview it). Every value is labelled
 * by kind: observed (the company's own data), benchmark (published), derived (calculated from
 * both), interpretation (what it does and doesn't show).
 */
export function BenchmarkComparisonCard({ c, preview = false }: { c: BenchmarkComparison; preview?: boolean }) {
  const src = c.benchmark.source;
  return (
    <article className="rounded-lg border p-4 text-sm space-y-2.5" style={{ borderColor: c.quality === "directional" ? "var(--amber)" : "var(--border)" }} aria-label={`${c.label} benchmark comparison`}>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold" style={fg}>{c.label}</h3>
        {c.assumption ? (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--amber-muted)", color: "#92400E" }}>Standard reference · an assumption</span>
        ) : (
          c.quality === "directional" && <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--amber-muted)", color: "var(--amber)" }}>Directional</span>
        )}
        {c.selection === "override" && <span className="text-xs" style={muted}>Chosen by your advisor</span>}
        {preview && <span className="text-xs ml-auto" style={muted}>Preview</span>}
      </div>
      <dl className="grid sm:grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-baseline">
        <dt><Kind tone="observed">Observed</Kind></dt>
        <dd style={fg}>
          <span className="font-mono font-semibold">{c.observed.formatted}</span>
          <span style={muted}>{c.observed.period && c.observed.period !== "Current" ? ` · ${c.observed.period}` : ""} · {c.observed.origin === "calculated" ? "calculated from your data" : c.observed.origin === "manual" ? "reported by you" : "read from your documents"}</span>
        </dd>
        <dt><Kind tone="benchmark">Benchmark</Kind></dt>
        <dd style={fg}>
          {c.benchmark.stats.map((s, i) => (
            <span key={s.recordId}>
              {i > 0 && <span style={muted}> · </span>}
              {s.statistic} <span className="font-mono font-semibold">{s.formatted}</span>
            </span>
          ))}
          <div className="text-xs mt-0.5" style={muted}>
            {c.benchmark.cohort} · {c.benchmark.period} ({c.benchmark.periodBasis.toLowerCase()}) · {c.benchmark.sampleSize !== null ? `n = ${c.benchmark.sampleSize}` : "sample size not published"}
          </div>
        </dd>
        {c.derived && (
          <>
            <dt><Kind tone="derived">Derived</Kind></dt>
            <dd style={fg}>
              {c.derived.formatted ? (
                <>
                  <span className="font-mono font-semibold" style={{ color: c.derived.better === true ? "var(--green)" : c.derived.better === false ? "var(--red)" : "var(--foreground)" }}>{c.derived.formatted}</span> the {c.derived.versus}
                  {c.derived.relativePct !== null && <span style={muted}> ({Math.abs(c.derived.relativePct)}%)</span>}
                  {c.derived.position && <span style={muted}>; {c.derived.position}</span>}
                </>
              ) : (
                c.derived.position
              )}
            </dd>
          </>
        )}
        <dt><Kind tone="interpretation">Interpretation</Kind></dt>
        <dd style={muted}>{c.interpretation}</dd>
      </dl>
      <p className="text-xs" style={muted}>
        <span className="font-semibold" style={fg}>Source: </span>
        {src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--green)" }}>{src.name}</a> : src.name}
        {src.publisher ? `, ${src.publisher}` : ""}
        {src.publishedOn ? ` (${src.publishedOn.slice(0, 4)})` : ""}
        {src.reference ? ` · ${src.reference}` : ""} · {c.benchmark.dataset.name}, version {c.benchmark.dataset.version}
        {src.attribution && <span className="block mt-0.5">{src.attribution}</span>}
      </p>
      <details className="text-xs" style={muted}>
        <summary className="cursor-pointer">Definition and limitations</summary>
        <p className="mt-1"><span className="font-semibold">Definition: </span>{c.benchmark.definition}</p>
        {c.benchmark.cohortDefinition && <p className="mt-1"><span className="font-semibold">Cohort: </span>{c.benchmark.cohortDefinition}</p>}
        {c.limitations.length > 0 && <ul className="mt-1 space-y-0.5">{c.limitations.map((l) => <li key={l}>• {l}</li>)}</ul>}
      </details>
    </article>
  );
}

/** The brief's benchmark block: comparisons, and the metrics with no relevant benchmark. */
export function BenchmarkComparisons({ comparisons, gaps }: { comparisons: BenchmarkComparison[]; gaps: { metric: string; label: string; reason: string }[] }) {
  if (!comparisons.length && !gaps.length) return null;
  return (
    <div className="mt-4 space-y-3" aria-label="Benchmark comparisons">
      <div className="text-xs font-semibold" style={fg}>Against published benchmarks</div>
      {comparisons.map((c) => <BenchmarkComparisonCard key={c.metric} c={c} />)}
      {gaps.length > 0 && (
        <div className="text-xs" style={muted}>
          <span className="font-semibold" style={fg}>No relevant benchmark: </span>
          {gaps.map((g) => `${g.label} (${g.reason.replace(/\.$/, "")})`).join("; ")}.
        </div>
      )}
      <p className="text-xs" style={muted}>A gap to a benchmark shows where you sit, not why. The diagnosis and plan rest on your own data.</p>
    </div>
  );
}
