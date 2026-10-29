import type { PeerComparison, PeerFigure, PeerPoint } from "@/lib/benchmark-library/peers";
import { pathYears } from "@/lib/benchmark-library/reference";
import { formatMetric } from "@/lib/metrics";
import { ExpandableDetail, TONE, type Tone } from "@/components/visual/primitives";

const muted = { color: "var(--muted-foreground)" };

/**
 * One peer comparison, visual first: the title with a position chip, then a strip with the
 * peers' bottom-to-top spread as a band, the median as a tick and the company as a dot (exact
 * figure) or a bar (a range it picked). Cohort, sources and caveats sit behind "Source", so
 * nothing is lost from the page; every value is also in the strip's text alternative.
 */
type StripData = { title: string; bottom: PeerPoint; median: PeerPoint | null; top: PeerPoint; company: PeerFigure | null; position: string | null };

/** Colour for a position sentence: above the median is good, below it needs a look. */
export function positionTone(position: string | null): Tone {
  if (!position) return "neutral";
  if (/^Your range spans/.test(position)) return "neutral";
  if (/^Above|^Between the median/.test(position)) return "green";
  if (/^Below|^Between the bottom/.test(position)) return "amber";
  return "neutral";
}

/** "Between the median and the top quartile" → "Above median" (chips stay short). */
export function shortPosition(position: string | null): string | null {
  if (!position) return null;
  if (/^Your range spans/.test(position)) return "Range spans bands";
  if (/^Above the top/i.test(position)) return "Top quartile+";
  if (/^Between the median/.test(position)) return "Above median";
  if (/^Between the bottom.*median/.test(position)) return "Below median";
  if (/^Below the bottom/i.test(position)) return "Bottom quartile";
  return position;
}

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
  const tone = TONE[positionTone(c.position)].fg;
  const color = tone === TONE.neutral.fg ? "var(--green)" : tone;
  const summary = `${c.title}: peers range from ${c.bottom.formatted} (${c.bottom.label.toLowerCase()}) to ${c.top.formatted} (${c.top.label.toLowerCase()})${c.median ? `, median ${c.median.formatted}` : ""}. ${f ? `You: ${f.text}. ${c.position}.` : "Your figure isn't known yet."}`;
  const label = (pos: number, text: string, strong = false) => (
    <span className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-mono" style={{ left: `${Math.min(92, Math.max(8, pos))}%`, color: strong ? "var(--foreground)" : "var(--subtle-foreground)", fontWeight: strong ? 600 : 400 }}>
      {text}
    </span>
  );
  const you = f ? x(f.exact ?? ((fLo ?? lo) + (fHi ?? hi)) / 2) : null;
  return (
    <div role="img" aria-label={summary} className="mx-2">
      <div className="relative h-5">{f && you !== null && label(you, `You ${f.text}`, true)}</div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ background: "var(--muted)" }} />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          title={`Peers: ${c.bottom.label} ${c.bottom.formatted} to ${c.top.label} ${c.top.formatted}`}
          style={{ left: `${x(c.bottom.value)}%`, width: `${Math.max(0.5, x(c.top.value) - x(c.bottom.value))}%`, background: "#CBD5E1" }}
        />
        {c.median && <div className="absolute top-0.5 h-5 w-0.5 -translate-x-1/2 rounded-full" title={`Median ${c.median.formatted}`} style={{ left: `${x(c.median.value)}%`, background: "var(--subtle-foreground)" }} />}
        {f &&
          fLo !== null &&
          fHi !== null &&
          (f.exact !== null ? (
            <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" title={`You: ${f.text}`} style={{ left: `${x(f.exact)}%`, background: color, borderColor: "#fff", boxShadow: `0 0 0 1px ${color}` }} />
          ) : (
            <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full" title={`You: ${f.text}`} style={{ left: `${x(fLo)}%`, width: `${Math.max(2, x(fHi) - x(fLo))}%`, background: color, boxShadow: "0 0 0 2px var(--card)" }} />
          ))}
      </div>
      <div className="relative h-5 mt-0.5">
        {label(x(c.bottom.value), c.bottom.formatted)}
        {c.median && !near(c.median.value, c.bottom.value) && !near(c.median.value, c.top.value) && label(x(c.median.value), c.median.formatted)}
        {label(x(c.top.value), c.top.formatted)}
      </div>
    </div>
  );
}

function Header({ title, position, chip }: { title: string; position?: string | null; chip?: { word: string; tone: Tone } }) {
  const short = shortPosition(position ?? null);
  const c = chip ?? (short ? { word: short, tone: positionTone(position ?? null) } : null);
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h3 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
        {title}
      </h3>
      {c && (
        <span data-label className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: TONE[c.tone].bg, color: TONE[c.tone].fg }}>
          {c.word}
        </span>
      )}
    </div>
  );
}
const You = ({ f }: { f: PeerFigure | null }) =>
  f ? (
    <p className="text-sm mt-1" style={{ color: "var(--foreground)" }}>
      You: <span className="font-mono font-semibold">{f.text}</span> <span style={muted}>({f.origin})</span>
    </p>
  ) : null;

/** The Snapshot's peer comparison for one metric, or a plain statement of why there isn't one and the best figure that does exist. */
export function PeerComparisonCard({ c }: { c: PeerComparison }) {
  const label = `${c.title} compared with peers`;
  if (c.status === "unavailable") {
    return (
      <article className="surface p-4" aria-label={label}>
        <Header title={c.title} chip={c.target.met === null ? undefined : c.target.met ? { word: "At top quartile", tone: "green" } : { word: "Below top quartile", tone: "amber" }} />
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-lg p-3" style={{ background: "var(--muted)" }}>
            <div data-label className="text-[11px] font-semibold" style={muted}>You</div>
            {c.company ? (
              <div className="font-mono text-lg font-semibold" style={{ color: "var(--foreground)" }}>{c.company.text}</div>
            ) : (
              <div className="text-sm font-semibold mt-1" style={muted}>Not given</div>
            )}
          </div>
          <div className="rounded-lg p-3" style={{ background: "var(--green-muted)" }}>
            <div data-label className="text-[11px] font-semibold" style={{ color: "var(--green)" }}>Top quartile</div>
            <div className="font-mono text-lg font-semibold" style={{ color: "var(--green)" }}>{c.target.formatted}+</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span data-label className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--subtle-foreground)" }}>
            Source · {[c.target.source.name, c.target.source.year].filter(Boolean).join(" ")} · stage-wide
          </span>
        </div>
        <div className="mt-2">
          <ExpandableDetail summary="Source">
            <p>{c.target.statement}</p>
            <p>{c.reason}</p>
            {c.target.met !== null && <p>{c.target.met ? `At ${c.company!.text}, you're already there.` : `At ${c.company!.text}, you're below it.`}</p>}
            <p>
              Peers: {c.target.cohort}
              {c.target.sampleSize ? ` (${c.target.sampleSize} companies)` : ""}, {c.target.period}. Source: {[c.target.source.name, c.target.source.publisher, c.target.source.year].filter(Boolean).join(", ")}; {c.target.dataset.name}, version {c.target.dataset.version}. A stage-wide figure, not specific to your founding year.
              {c.target.source.attribution && ` ${c.target.source.attribution}`}
            </p>
          </ExpandableDetail>
        </div>
      </article>
    );
  }
  if (c.status === "reference") {
    const r = c.reference;
    const position = c.company ? c.position : null;
    return (
      <article className="surface p-4" aria-label={label}>
        <Header title={`${c.title} · ${r.metricLabel}`} position={position} />
        <div className="mt-2">
          <Strip c={{ title: c.title, bottom: r.bottom, median: r.median, top: r.top, company: c.company, position }} />
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <span data-label className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "var(--amber-muted)", color: "#92400E" }}>
            Assumption · Growth Goaled standard reference
          </span>
        </div>
        <div className="mt-2">
          <ExpandableDetail summary="Source">
            <p>{c.reason}</p>
            {!c.company && <p>Add your {r.metricLabel.toLowerCase()} to see where you sit.</p>}
            {c.position && <p>{c.position}.</p>}
            {r.elite && <p>{r.elite}</p>}
            <p>{r.basis}</p>
          </ExpandableDetail>
        </div>
      </article>
    );
  }
  if (c.status === "trajectory") {
    const from1 = pathYears(c.path, 1_000_000);
    const from2 = pathYears(c.path, 2_000_000);
    const phase = (m: number) => (m === 3 ? "Triple" : m === 2 ? "Double" : `${m}×`);
    return (
      <article className="surface p-4" aria-label={label}>
        <Header title={`${c.title} · ARR`} chip={{ word: "T2D3 path", tone: "blue" }} />
        <You f={c.company} />
        <p className="text-sm mt-1" style={{ color: "var(--foreground)" }}>
          Aim: {c.target}
        </p>
        <div className="mt-2">
          <ExpandableDetail summary="The growth path and source">
            <p>{c.reason}</p>
            <p>Top-quartile venture-backed companies follow a path like T2D3: triple ARR for two years, then double it for three. Standard reference · an assumption.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[360px]">
                <caption className="sr-only">The growth path from $1M and from $2M ARR</caption>
                <thead>
                  <tr className="text-left">
                    <th className="py-1 pr-2 font-semibold">Year</th>
                    <th className="py-1 pr-2 font-semibold">From $1M</th>
                    <th className="py-1 font-semibold">From $2M</th>
                  </tr>
                </thead>
                <tbody>
                  {from1.map((y, i) => (
                    <tr key={y.year} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1 pr-2">Year {y.year}</td>
                      <td className="py-1 pr-2">
                        <span className="font-semibold" style={{ color: "var(--foreground)" }}>{formatMetric("arr", y.arr)}</span> then {phase(y.multiplier)}
                      </td>
                      <td className="py-1">
                        <span className="font-semibold" style={{ color: "var(--foreground)" }}>{formatMetric("arr", from2[i]!.arr)}</span> then {phase(from2[i]!.multiplier)}
                        {i === 0 ? " · common Series A entry point" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>{c.path.basis}</p>
          </ExpandableDetail>
        </div>
      </article>
    );
  }
  if (c.status === "none") {
    return (
      <article className="surface p-4" aria-label={label}>
        <Header title={c.title} chip={{ word: "No peer data", tone: "neutral" }} />
        <You f={c.company} />
        <div className="mt-2">
          <ExpandableDetail summary="Why">
            <p>{c.reason}</p>
          </ExpandableDetail>
        </div>
      </article>
    );
  }
  return (
    <article className="surface p-4" aria-label={label}>
      <Header title={`${c.title} · ${c.metric === "arr" ? "ARR" : c.metric === "nrr" ? "NRR" : "YoY growth"}`} position={c.position} />
      <div className="mt-2">
        <Strip c={c} />
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-1">
        <span data-label className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--subtle-foreground)" }}>
          Source · {[c.source.name, c.source.year].filter(Boolean).join(" ")}
        </span>
      </div>
      <div className="mt-2">
        <ExpandableDetail summary="Source">
          {c.position && <p>{c.position ?? "Add your figure to see where you sit."}.</p>}
          <p>
            {c.bottom.label} {c.bottom.formatted} · Median {c.median?.formatted ?? "not published"} · {c.top.label} {c.top.formatted}
          </p>
          <p>
            Peers: {c.cohort}
            {c.sampleSize ? ` (${c.sampleSize} companies)` : ""}, {c.period}. Source: {[c.source.name, c.source.publisher, c.source.year].filter(Boolean).join(", ")}; {c.dataset.name}, version {c.dataset.version}.
            {c.company && ` Your figure: ${c.company.origin}.`}
            {c.source.attribution && ` ${c.source.attribution}`}
          </p>
        </ExpandableDetail>
      </div>
    </article>
  );
}
