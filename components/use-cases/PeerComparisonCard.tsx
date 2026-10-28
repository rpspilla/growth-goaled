import type { PeerComparison, PeerFigure, PeerPoint } from "@/lib/benchmark-library/peers";
import { T2D3 } from "@/lib/benchmark-library/reference";
import { formatMetric } from "@/lib/metrics";

const muted = { color: "var(--muted-foreground)" };

/**
 * One peer comparison as a strip: the peers' bottom-to-top spread as a band, the median as a
 * tick, and the company as a dot (exact figure) or a bar (a range it picked). Drawn in HTML so
 * labels keep their text size on any screen; every value is also written out below the strip.
 */
type StripData = { title: string; bottom: PeerPoint; median: PeerPoint | null; top: PeerPoint; company: PeerFigure | null; position: string | null };

function Strip({ c }: { c: StripData }) {
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

function Spread({ c, note }: { c: StripData; note?: string }) {
  return (
    <>
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
      {note && <p className="text-sm mt-2" style={muted}>{note}</p>}
    </>
  );
}

const Header = ({ title, label }: { title: string; label?: string }) => (
  <div className="flex items-baseline justify-between gap-3 flex-wrap">
    <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>{title}</h3>
    {label && <span className="text-sm" style={muted}>{label}</span>}
  </div>
);
const You = ({ f }: { f: PeerFigure | null }) =>
  f ? <p className="text-base mt-1" style={{ color: "var(--foreground)" }}>You: {f.text} <span style={muted}>({f.origin})</span></p> : null;
const Assumption = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-4 rounded-xl px-4 py-3" style={{ background: "var(--muted)" }}>
    <div className="text-sm font-semibold mb-1" style={{ color: "var(--amber)" }}>Standard reference · an assumption</div>
    {children}
  </div>
);

/** The Snapshot's peer comparison for one metric, or a plain statement of why there isn't one and the best figure that does exist. */
export function PeerComparisonCard({ c }: { c: PeerComparison }) {
  const label = `${c.title} compared with peers`;
  if (c.status === "unavailable") {
    return (
      <article className="surface p-5" aria-label={label}>
        <Header title={c.title} />
        <You f={c.company} />
        <p className="text-base mt-2" style={muted}>{c.reason}</p>
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
      </article>
    );
  }
  if (c.status === "reference") {
    const r = c.reference;
    return (
      <article className="surface p-5" aria-label={label}>
        <Header title={c.title} label={r.metricLabel} />
        <p className="text-base mt-2" style={muted}>{c.reason}</p>
        <Assumption>
          <Spread c={{ title: c.title, bottom: r.bottom, median: r.median, top: r.top, company: c.company, position: c.company ? c.position : `Add your ${r.metricLabel.toLowerCase()} to see where you sit.` }} note={r.elite} />
          <p className="text-sm mt-2" style={muted}>{c.basis}</p>
        </Assumption>
      </article>
    );
  }
  if (c.status === "trajectory") {
    return (
      <article className="surface p-5" aria-label={label}>
        <Header title={c.title} label="ARR" />
        <You f={c.company} />
        <p className="text-base mt-2" style={muted}>{c.reason}</p>
        <Assumption>
          <p className="text-base font-medium" style={{ color: "var(--foreground)" }}>
            Top-quartile venture-backed companies follow the T2D3 path: triple ARR for two years, then double it for three. On that path you&apos;d aim to {c.target}.
          </p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm min-w-[420px]">
              <caption className="sr-only">The T2D3 path from $1M and from $2M ARR</caption>
              <thead>
                <tr className="text-left" style={muted}>
                  <th className="py-1.5 pr-2 font-semibold">Year</th>
                  <th className="py-1.5 pr-2 font-semibold">Phase</th>
                  <th className="py-1.5 pr-2 font-semibold">From $1M</th>
                  <th className="py-1.5 font-semibold">From $2M</th>
                </tr>
              </thead>
              <tbody>
                {T2D3.map((y) => (
                  <tr key={y.year} className="border-t" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                    <td className="py-1.5 pr-2">Year {y.year}</td>
                    <td className="py-1.5 pr-2">{y.phase} · {y.multiplier}×</td>
                    <td className="py-1.5 pr-2 font-semibold">{formatMetric("arr", y.from1m)}</td>
                    <td className="py-1.5 font-semibold">{formatMetric("arr", y.from2m)}{y.year === 1 ? " (common Series A entry point)" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm mt-2" style={muted}>{c.basis}</p>
        </Assumption>
      </article>
    );
  }
  return (
    <article className="surface p-5" aria-label={label}>
      <Header title={c.title} label={c.metric === "arr" ? "ARR" : c.metric === "nrr" ? "Net revenue retention" : "Year-over-year ARR growth"} />
      <Spread c={c} />
      <p className="text-sm mt-3" style={muted}>
        Peers: {c.cohort}
        {c.sampleSize ? ` (${c.sampleSize} companies)` : ""}, {c.period}. Source: {[c.source.name, c.source.publisher, c.source.year].filter(Boolean).join(", ")}; {c.dataset.name}, version {c.dataset.version}.
        {c.company && ` Your figure: ${c.company.origin}.`}
        {c.source.attribution && ` ${c.source.attribution}`}
      </p>
    </article>
  );
}
