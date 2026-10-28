import type { PeerComparison } from "@/lib/benchmark-library/peers";

const muted = { color: "var(--muted-foreground)" };

/**
 * One peer comparison as a strip: the peers' bottom-to-top spread as a band, the median as a
 * tick, and the company as a dot (exact figure) or a bar (a range it picked). Drawn in HTML so
 * labels keep their text size on any screen; every value is also written out below the strip.
 */
function Strip({ c }: { c: Extract<PeerComparison, { status: "compared" }> }) {
  const f = c.company;
  const values = [c.bottom.value, c.top.value, c.median?.value, f?.lo, f?.hi].filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = hi - lo || Math.abs(hi) || 1;
  lo -= span * 0.08;
  hi += span * 0.08;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const near = (a: number, b: number) => Math.abs(x(a) - x(b)) < 14;
  const fLo = f ? (f.lo ?? lo) : null;
  const fHi = f ? (f.hi ?? hi) : null;
  const summary = `${c.title}: peers range from ${c.bottom.formatted} (${c.bottom.label.toLowerCase()}) to ${c.top.formatted} (${c.top.label.toLowerCase()})${c.median ? `, median ${c.median.formatted}` : ""}. ${f ? `You: ${f.text}. ${c.position}.` : "Your figure isn't known yet."}`;
  const label = (pos: number, text: string, strong = false) => (
    <span className="absolute -translate-x-1/2 whitespace-nowrap text-xs" style={{ left: `${Math.min(94, Math.max(6, pos))}%`, color: strong ? "var(--foreground)" : "var(--muted-foreground)", fontWeight: strong ? 600 : 400 }}>
      {text}
    </span>
  );
  const you = f ? x(f.exact ?? ((fLo ?? lo) + (fHi ?? hi)) / 2) : null;
  return (
    <div role="img" aria-label={summary} className="mx-2">
      <div className="relative h-5">{f && you !== null && label(you, `You: ${f.text}`, true)}</div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full" style={{ background: "var(--border)" }} />
        <div
          className="absolute top-1/2 h-[18px] -translate-y-1/2 rounded"
          title={`Peers: ${c.bottom.label} ${c.bottom.formatted} to ${c.top.label} ${c.top.formatted}`}
          style={{ left: `${x(c.bottom.value)}%`, width: `${Math.max(0.5, x(c.top.value) - x(c.bottom.value))}%`, background: "var(--subtle-foreground, #94A3B8)", opacity: 0.35 }}
        />
        {c.median && <div className="absolute top-0 h-full w-0.5 -translate-x-1/2 rounded-full" title={`Median ${c.median.formatted}`} style={{ left: `${x(c.median.value)}%`, background: "var(--foreground)" }} />}
        {f && fLo !== null && fHi !== null &&
          (f.exact !== null ? (
            <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full" title={`You: ${f.text}`} style={{ left: `${x(f.exact)}%`, background: "var(--green)", boxShadow: "0 0 0 2px var(--card)" }} />
          ) : (
            <div className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded" title={`You: ${f.text}`} style={{ left: `${x(fLo)}%`, width: `${Math.max(2, x(fHi) - x(fLo))}%`, background: "var(--green)", boxShadow: "0 0 0 2px var(--card)" }} />
          ))}
      </div>
      <div className="relative h-5 mt-1">
        {label(x(c.bottom.value), c.bottom.formatted)}
        {c.median && !near(c.median.value, c.bottom.value) && !near(c.median.value, c.top.value) && label(x(c.median.value), c.median.formatted, true)}
        {label(x(c.top.value), c.top.formatted)}
      </div>
    </div>
  );
}

/** The Snapshot's peer comparison for one metric, or a plain statement of why there isn't one. */
export function PeerComparisonCard({ c }: { c: PeerComparison }) {
  if (c.status === "unavailable") {
    return (
      <article className="surface p-5" aria-label={`${c.title} compared with peers`}>
        <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>{c.title}</h3>
        {c.company && <p className="text-base mt-1" style={{ color: "var(--foreground)" }}>You: {c.company.text} <span style={muted}>({c.company.origin})</span></p>}
        <p className="text-base mt-2" style={muted}>{c.reason}</p>
        {c.target && (
          <div className="mt-4 rounded-xl px-4 py-3" style={{ background: "var(--muted)" }}>
            <p className="text-base font-medium" style={{ color: "var(--foreground)" }}>{c.target.statement}</p>
            {c.target.met !== null && (
              <p className="text-sm mt-1" style={{ color: c.target.met ? "var(--green)" : "var(--foreground)" }}>
                {c.target.met ? `At ${c.company!.text}, you're already there.` : `At ${c.company!.text}, you're below it.`}
              </p>
            )}
            <p className="text-sm mt-2" style={muted}>
              Peers: {c.target.cohort}
              {c.target.sampleSize ? ` (${c.target.sampleSize} companies)` : ""}, {c.target.period}. Source: {[c.target.source.name, c.target.source.publisher, c.target.source.year].filter(Boolean).join(", ")}; {c.target.dataset.name}, version {c.target.dataset.version}. A stage-wide figure, not specific to your founding year.
              {c.target.source.attribution && ` ${c.target.source.attribution}`}
            </p>
          </div>
        )}
      </article>
    );
  }
  return (
    <article className="surface p-5" aria-label={`${c.title} compared with peers`}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>{c.title}</h3>
        <span className="text-sm" style={muted}>{formatMetricLabel(c)}</span>
      </div>
      <p className="text-base font-medium mt-1" style={{ color: "var(--foreground)" }}>
        {c.position ?? "Add your figure to see where you sit."}
      </p>
      <div className="mt-3">
        <Strip c={c} />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm mt-1">
        <div><dt style={muted}>{c.bottom.label}</dt><dd className="font-semibold" style={{ color: "var(--foreground)" }}>{c.bottom.formatted}</dd></div>
        <div><dt style={muted}>Median</dt><dd className="font-semibold" style={{ color: "var(--foreground)" }}>{c.median?.formatted ?? "Not published"}</dd></div>
        <div><dt style={muted}>{c.top.label}</dt><dd className="font-semibold" style={{ color: "var(--foreground)" }}>{c.top.formatted}</dd></div>
      </dl>
      <p className="text-sm mt-3" style={muted}>
        Peers: {c.cohort}
        {c.sampleSize ? ` (${c.sampleSize} companies)` : ""}, {c.period}. Source: {[c.source.name, c.source.publisher, c.source.year].filter(Boolean).join(", ")}; {c.dataset.name}, version {c.dataset.version}.
        {c.company && ` Your figure: ${c.company.origin}.`}
        {c.source.attribution && ` ${c.source.attribution}`}
      </p>
    </article>
  );
}

const formatMetricLabel = (c: Extract<PeerComparison, { status: "compared" }>) => (c.metric === "arr" ? "ARR" : c.metric === "nrr" ? "Net revenue retention" : "Year-over-year ARR growth");
