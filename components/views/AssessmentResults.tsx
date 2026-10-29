"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Compass,
  Droplet,
  Filter,
  Gauge,
  Layers,
  Mic,
  Rocket,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SourceTrailPanel } from "@/components/SourceTrailPanel";
import { BenchmarkComparisons } from "@/components/benchmarks/BenchmarkComparisonCard";
import { Pill, type Tone } from "@/components/ui/Pill";
import { ExpandableDetail, MetricTile, StatusChip, TONE, VerdictBadge } from "@/components/visual/primitives";
import type { ResultsView } from "@/lib/data/assessments";
import { SignatureCharts } from "./SignatureCharts";

const muted = { color: "var(--muted-foreground)" };

export type DataItemState = "in" | "partial" | "missing" | "not_shared" | "not_applicable";
/** A plan dimension with the data items behind it, each linked to where it's updated. */
export type DimensionView = { id: string; title: string; summary: string; items: { key: string; name: string; state: DataItemState; href: string }[] };
const ITEM_STATE: Record<DataItemState, { label: string; tone: Tone }> = {
  in: { label: "In", tone: "green" },
  partial: { label: "Partly in", tone: "amber" },
  missing: { label: "Missing", tone: "red" },
  not_shared: { label: "Not shared yet", tone: "neutral" },
  not_applicable: { label: "Not applicable", tone: "neutral" },
};
/** The staged plan as three columns: Now (days 1–30), Next (31–60), Later (61–90). */
const STAGES = [
  { timing: "next_30_days", label: "Now", days: "Days 1–30" },
  { timing: "days_31_60", label: "Next", days: "Days 31–60" },
  { timing: "days_61_90", label: "Later", days: "Days 61–90" },
] as const;
const fg = { color: "var(--foreground)" };

const CERTAINTY: Record<string, { label: string; tone: Tone; note: string }> = {
  established: { label: "Established", tone: "green", note: "Your calculated figures clearly point to this explanation over the others." },
  leading: { label: "Most likely", tone: "amber", note: "The evidence favours this explanation, but not decisively. The test below would confirm it." },
  unresolved: { label: "Not yet established", tone: "red", note: "Your data can't yet separate the possible explanations. The test below is the fastest way to tell them apart." },
};
/** What kind of statement each piece of evidence is, so a hypothesis never reads like a fact. */
const KIND: Record<string, { label: string; tone: Tone }> = {
  verified: { label: "Your data", tone: "green" },
  calculated: { label: "Calculated", tone: "green" },
  inference: { label: "Interpretation", tone: "blue" },
  hypothesis: { label: "Hypothesis · to validate", tone: "amber" },
};
const ORIGIN = { calculated: "Calculated from your file", manual: "Reported by you", extracted: "Read from your document" } as const;
const DIM_ICON: Record<string, LucideIcon> = {
  retention: Droplet,
  onboarding: Rocket,
  expansion: TrendingUp,
  sales_calls: Mic,
  capacity: Gauge,
  pipeline: Filter,
  hiring: UserPlus,
  icp: Target,
  channels: Compass,
};
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
// Lower-cases a leading capital for mid-sentence use, but leaves acronyms ("NRR", "ARR") alone.
const midSentence = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

function Block({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div>
        <h2 id={id} className="text-xl font-semibold" style={{ ...fg, letterSpacing: "-0.01em" }}>
          {title}
        </h2>
        {lead && (
          <p className="text-sm mt-1" style={muted}>
            {lead}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Detail({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details className="disclosure surface p-5">
      <summary className="text-base">
        {title}
        {count !== undefined && (
          <span className="font-normal" style={muted}>
            {" "}
            · {count}
          </span>
        )}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

/** Low / Medium / High as three bars: confidence in the inputs, never a made-up percentage. */
function ConfidenceMeter({ level }: { level: string }) {
  const n = level === "High" ? 3 : level === "Medium" ? 2 : 1;
  const tone: Tone = n === 3 ? "green" : n === 2 ? "amber" : "red";
  return (
    <div className="flex flex-col items-center gap-1.5" role="img" aria-label={`Confidence in your inputs: ${level}`}>
      <div className="flex items-end gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-3.5 rounded-sm" style={{ height: 14 + i * 9, background: i < n ? TONE[tone].fg : "var(--muted)" }} />
        ))}
      </div>
      <span data-label className="text-xs font-semibold" style={muted}>
        Confidence · {level}
      </span>
    </div>
  );
}

/** The answer as a short badge: the recommended option when it's short, else the diagnosis certainty. */
function verdictOf(data: ResultsView): { label: string; tone: Tone } {
  const option = data.recommendation.option.replace(/[.:].*$/, "").trim();
  const certainty = data.certainty ? CERTAINTY[data.certainty] : null;
  const tone: Tone = certainty?.tone === "red" ? "amber" : (certainty?.tone ?? "green");
  if (option && option.split(/\s+/).length <= 5) return { label: option, tone };
  return certainty ? { label: certainty.label, tone } : { label: "Our answer", tone: "green" };
}

/**
 * A Decision Brief, visual first (visual-founder-flow brief §5): an answer card (verdict, one
 * sentence, three tiles, confidence, commit), the question's signature charts, each plan area as
 * a card with at most three findings, then the plan as Now / Next / Later. Everything else (the
 * reasoning, all evidence, points against, assumptions, method) is one click away, and every
 * statement still opens its Source Trail.
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
  compareHref,
  dimensions,
  onSourceTrail,
  dataPath = "/data",
}: {
  title: string;
  data: ResultsView;
  nextUseCase: { href: string; question: string } | null;
  /** The optional advisory offer, shown once at the end. */
  advisory: ReactNode;
  /** Extra controls under the header (e.g. re-run with new data). */
  actions?: ReactNode;
  /** Booking link for an advisor review, shown with the answer and the gaps. */
  reviewHref?: string;
  /** "Check your figures", shown with the numbers. */
  figures?: ReactNode;
  /** "Commit to this plan" (or where it's tracked), shown with the answer. */
  commit?: ReactNode;
  /** Where the peer comparisons live (the Overview); linked from the numbers. */
  compareHref?: string;
  /** The plan's dimensions, with the data behind each: when given, findings are grouped by them. */
  dimensions?: DimensionView[];
  onSourceTrail?: (claimKey: string) => void;
  /** Where "Needs data" links go: the founder's Data step, or the advisor's view of it. */
  dataPath?: string;
}) {
  const [openClaim, setOpenClaimState] = useState<string | null>(null);
  const open = (key: string) => {
    setOpenClaimState(key);
    onSourceTrail?.(key);
  };
  const evidence = (key: string, compact = false) =>
    data.claims[key] ? (
      <button type="button" className={`btn-ghost ${compact ? "text-xs" : "text-sm"} font-semibold shrink-0`} onClick={() => open(key)}>
        Evidence →
      </button>
    ) : null;

  const certainty = data.certainty ? CERTAINTY[data.certainty] : null;
  const { confidence } = data;
  const verdict = verdictOf(data);
  const first = data.plan[0];
  const dims = dimensions ?? [];
  const dimById = new Map(dims.map((d) => [d.id, d]));

  // Three tiles that justify the answer: calculated figures first, coloured against the peer
  // median (or the previous brief) where one exists.
  const tileRows = [...data.baseline].sort((a, b) => Number(b.origin === "calculated") - Number(a.origin === "calculated")).slice(0, 3);
  const tile = (r: ResultsView["baseline"][number]) => {
    const lower = /cycle|payback|burn|ramp|concentration/i.test(r.metric);
    if (r.medianRaw !== null && r.median) {
      const better = lower ? r.raw <= r.medianRaw : r.raw >= r.medianRaw;
      return <MetricTile key={r.metric} label={r.label} value={r.value} compare={`Peer median ${r.median}`} tone={better ? "green" : "amber"} trend={better ? "up" : "down"} />;
    }
    if (r.previous) {
      const t: Tone = r.previous.direction === "better" ? "green" : r.previous.direction === "worse" ? "amber" : "neutral";
      return <MetricTile key={r.metric} label={r.label} value={r.value} compare={`Last brief ${r.previous.value}`} tone={t} trend={r.previous.direction === "better" ? "up" : r.previous.direction === "worse" ? "down" : undefined} />;
    }
    return <MetricTile key={r.metric} label={r.label} value={r.value} compare={r.period && r.period !== "Current" ? r.period : ORIGIN[r.origin]} />;
  };

  const evidenceRow = (e: ResultsView["evidence"][number]) => (
    <li key={e.claimKey} className="py-2 flex gap-2 items-start flex-wrap sm:flex-nowrap">
      {e.bearing === "contradicts" ? <Pill tone="red">Points against</Pill> : <Pill tone={KIND[e.status]!.tone}>{KIND[e.status]!.label}</Pill>}
      <span className="flex-1 text-sm min-w-0" style={fg}>
        {e.text}
      </span>
      {evidence(e.claimKey, true)}
    </li>
  );

  const actionCard = (a: ResultsView["plan"][number]) => {
    const dim = a.dimension ? dimById.get(a.dimension) : undefined;
    return (
      <li key={a.claimKey} className="rounded-xl p-3.5 space-y-2" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex gap-2 items-start">
          {a.priority === 1 && (
            <span data-label className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{ background: "var(--green)", color: "#fff" }}>
              FIRST
            </span>
          )}
          <span className="text-sm font-semibold flex-1" style={fg}>
            {a.action}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5" data-label>
          {(a.metricLabel || a.successMetric) && (
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--green-muted)", color: "var(--green)" }} title={a.successMetric}>
              KPI · {a.metricLabel ?? (a.successMetric.length > 28 ? `${a.successMetric.slice(0, 26)}…` : a.successMetric)}
            </span>
          )}
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
            {a.role ?? "Owner: your call"}
          </span>
          {dim && dim.title !== a.metricLabel && (
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              {dim.title}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <ExpandableDetail summary="Details">
            <p>{a.rationale}</p>
            {a.successMetric && (
              <p>
                <span className="font-semibold" style={fg}>Measure: </span>
                {a.successMetric}
                {a.metricLabel ? ` (tracked: ${a.metricLabel})` : ""}
              </p>
            )}
            {a.expectedSignal && (
              <p>
                <span className="font-semibold" style={fg}>Signal to look for: </span>
                {a.expectedSignal} <span className="italic">(proposed)</span>
              </p>
            )}
            {a.dependenciesRisks && (
              <p>
                <span className="font-semibold" style={fg}>Depends on / risks: </span>
                {a.dependenciesRisks}
              </p>
            )}
          </ExpandableDetail>
          {evidence(a.claimKey, true)}
        </div>
      </li>
    );
  };

  const benchmarkNote =
    data.benchmarks.length > 0 || data.benchmarkGaps.length > 0 ? (
      <ExpandableDetail summary={`Against published benchmarks${data.benchmarks.length ? ` · ${data.benchmarks.length}` : ""}`}>
        <BenchmarkComparisons comparisons={data.benchmarks} gaps={data.benchmarkGaps} />
      </ExpandableDetail>
    ) : data.reference ? (
      <p className="text-sm" style={muted}>
        Peer reference: {data.reference.name}
        {data.reference.companyCount ? ` (${data.reference.companyCount} companies)` : ""}
        {data.reference.sources.length ? `; source: ${data.reference.sources.join("; ")}` : ""}. Approved, cited reference data only.
      </p>
    ) : (
      <p className="text-sm" style={muted}>
        No sufficiently relevant published benchmark matches your company yet, so this judges your figures against your own trend and target, not peers.
      </p>
    );

  // Areas: each plan dimension with its findings, or, without dimensions, all the evidence.
  const areaState = (d: DimensionView): { status: "in" | "partial" | "missing"; word: string } => {
    const relevant = d.items.filter((i) => i.state !== "not_applicable");
    const inCount = relevant.filter((i) => i.state === "in").length;
    if (relevant.length && inCount === relevant.length) return { status: "in", word: "Data in" };
    if (inCount > 0 || relevant.some((i) => i.state === "partial")) return { status: "partial", word: "Partial data" };
    return { status: "missing", word: "Needs data" };
  };
  const shared = data.evidence.filter((e) => !e.dimension || !dimById.has(e.dimension));
  const hasPeers = data.baseline.some((r) => r.median || r.topQuartile);
  const hasPrevious = data.baseline.some((r) => r.previous);

  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl space-y-10">
      <SourceTrailPanel
        claim={openClaim ? (data.claims[openClaim] ?? null) : null}
        onClose={() => setOpenClaimState(null)}
        note={data.reviewed ? "Checked in code against your inputs and reviewed by your advisor." : "Checked in code against your inputs."}
      />

      <header className="space-y-2">
        <div className="label">
          Results · version {data.version} · {date(data.builtAt)}
        </div>
        <h1 className="font-display text-2xl sm:text-3xl" style={fg}>
          {title}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {data.reviewed ? (
            <span data-label className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
              <CheckCircle2 size={13} aria-hidden /> Reviewed by {data.reviewed.by ?? "your advisor"} on {date(data.reviewed.at)}
            </span>
          ) : (
            <span data-label className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }} title="Figures are calculated from your data and every statement was checked against your inputs. Open “Evidence” to see the source.">
              <CheckCircle2 size={13} aria-hidden /> Every statement checked against your inputs
            </span>
          )}
          {data.reviewed?.comment && (
            <span className="text-sm" style={fg}>
              “{data.reviewed.comment}”
            </span>
          )}
        </div>
        {actions}
      </header>

      {/* 1. The answer */}
      <section aria-labelledby="the-answer" className="surface p-5 sm:p-7 -mt-4" style={{ borderColor: "var(--green)", boxShadow: "0 0 0 1px var(--green)" }}>
        <h2 id="the-answer" className="sr-only">
          The answer
        </h2>
        <div className="grid md:grid-cols-[minmax(0,1fr)_auto] gap-5 items-start">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <VerdictBadge label={verdict.label} tone={verdict.tone} />
              {certainty && <StatusChip status={certainty.tone === "green" ? "positive" : certainty.tone === "amber" ? "watch" : "info"} word={`Diagnosis: ${certainty.label}`} />}
            </div>
            <div className="flex gap-3 items-start">
              <p className="flex-1 font-display text-2xl sm:text-3xl leading-tight" style={fg}>
                {data.executiveDecision.decision}
              </p>
              {evidence(data.executiveDecision.claimKey)}
            </div>
            <p className="flex items-center gap-2 text-sm flex-wrap" style={fg}>
              <span data-label className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--amber-muted)", color: "#92400E" }}>
                PROBLEM
              </span>
              <span className="font-medium">{data.diagnosis.primary.title}</span>
            </p>
            {first && (
              <p className="flex items-center gap-2 text-sm flex-wrap" style={fg}>
                <span data-label className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--green)", color: "#fff" }}>
                  DO FIRST
                </span>
                <span className="font-medium">{first.action}</span>
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap pt-1">
              {commit}
              {reviewHref && (
                <a href={reviewHref} className="text-sm link">
                  Review with an advisor
                </a>
              )}
            </div>
          </div>
          <ConfidenceMeter level={confidence.level} />
        </div>
        {tileRows.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">{tileRows.map(tile)}</div>}
        <div className="mt-4">
          <ExpandableDetail summary="Why this answer">
            <p style={fg}>{data.executiveDecision.conclusion}</p>
            <p>
              <span className="font-semibold" style={fg}>
                The problem: {data.diagnosis.primary.title}.{" "}
              </span>
              {data.diagnosis.primary.explanation} {evidence(data.diagnosis.primary.claimKey, true)}
            </p>
            {certainty && <p>{certainty.note}</p>}
            {data.diagnosis.howToDistinguish && (
              <p>
                <span className="font-semibold" style={fg}>Fastest test: </span>
                {data.diagnosis.howToDistinguish}
              </p>
            )}
            <p>
              <span className="font-semibold" style={fg}>Recommendation: </span>
              {data.recommendation.option}
              {data.recommendation.why ? `. ${data.recommendation.why}` : ""} {evidence(data.recommendation.claimKey, true)}
            </p>
            <p>Confidence in your inputs: {confidence.level}. {confidence.reasons.join(" ")}</p>
          </ExpandableDetail>
        </div>
      </section>

      {(data.degraded || data.dataGaps.length > 0) && (
        <div className="-mt-6 flex items-center gap-2 flex-wrap" role="note">
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full" style={{ background: "var(--amber-muted)", color: "#92400E" }}>
            <AlertTriangle size={13} aria-hidden />
            {data.degraded ? "Partial brief" : `${data.dataGaps.length} ${data.dataGaps.length === 1 ? "gap" : "gaps"} limit this`}
          </span>
          {data.dataGaps.slice(0, 3).map((g) => (
            <Link key={g} href={dataPath} data-label title={g} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full max-w-[16rem] truncate" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
              <CircleDashed size={12} className="shrink-0" aria-hidden />
              <span className="truncate">{g}</span>
            </Link>
          ))}
          <ExpandableDetail summary={data.dataGaps.length > 3 ? `All ${data.dataGaps.length}` : "Details"}>
            {data.degraded && <p>A partial brief: the full analysis couldn&apos;t be completed this time.</p>}
            <ul className="space-y-1">
              {data.dataGaps.map((g) => (
                <li key={g}>• {g}</li>
              ))}
            </ul>
            {reviewHref && (
              <a href={reviewHref} className="link">
                Book time with an executive advisor to review it →
              </a>
            )}
          </ExpandableDetail>
        </div>
      )}

      {/* 2. Signature charts */}
      <section aria-label="Charts" className="space-y-4">
        <SignatureCharts useCase={data.useCase} charts={data.charts} baseline={data.baseline} dataPath={dataPath} />
      </section>

      {/* 3. By area */}
      <Block id="areas" title={dims.length ? "By area" : "What the evidence shows"}>
        {dims.length ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {dims.map((d) => {
              const Icon = DIM_ICON[d.id] ?? Layers;
              const found = data.evidence.filter((e) => e.dimension === d.id);
              const top = found.filter((e) => e.bearing !== "contradicts").slice(0, 3);
              const st = areaState(d);
              const gaps = d.items.filter((it) => it.state !== "in" && it.state !== "not_applicable");
              return (
                <section key={d.id} id={`dim-${d.id}`} aria-labelledby={`dim-${d.id}-title`} className="surface p-4 flex flex-col gap-2.5 scroll-mt-24" style={st.status === "missing" && !found.length ? { background: "var(--muted)" } : undefined}>
                  <div className="flex items-start gap-2">
                    <Icon size={18} className="shrink-0 mt-0.5" style={{ color: "var(--green)" }} aria-hidden />
                    <h3 id={`dim-${d.id}-title`} className="text-sm font-semibold leading-snug" style={fg} title={d.summary}>
                      {d.title}
                    </h3>
                  </div>
                  <div>
                    <StatusChip status={st.status} word={st.word} />
                  </div>
                  {top.length ? (
                    <ul className="space-y-1.5 text-sm" style={fg}>
                      {top.map((e) => (
                        <li key={e.claimKey} className="flex gap-2">
                          <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: TONE[KIND[e.status]!.tone as keyof typeof TONE]?.fg ?? "var(--green)" }} aria-hidden />
                          <span>{e.text}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    gaps.length > 0 && (
                      <Link href={gaps[0]!.href} className="text-sm link">
                        Add data →
                      </Link>
                    )
                  )}
                  <div className="mt-auto space-y-1">
                    {found.length > 0 && (
                      <ExpandableDetail summary="Show evidence">
                        <p>{d.summary}</p>
                        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                          {found.map(evidenceRow)}
                        </ul>
                      </ExpandableDetail>
                    )}
                    <ExpandableDetail summary={`Data behind this${gaps.length ? ` · ${gaps.length} to add` : ""}`}>
                      <ul className="space-y-1.5">
                        {d.items.map((it) => (
                          <li key={it.key} className="flex items-center gap-2 flex-wrap">
                            <span className="flex-1 min-w-0" style={fg}>
                              {it.name}
                            </span>
                            <Pill tone={ITEM_STATE[it.state].tone}>{ITEM_STATE[it.state].label}</Pill>
                            <Link href={it.href} className="text-xs link" aria-label={`Update ${it.name}`}>
                              Update
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </ExpandableDetail>
                  </div>
                </section>
              );
            })}
          </div>
        ) : null}
        {(shared.length > 0 || !dims.length) && (
          <div className="surface p-4">
            {dims.length > 0 && (
              <h3 className="text-sm font-semibold mb-1" style={fg}>
                Across all areas
              </h3>
            )}
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {(dims.length ? shared : data.evidence).slice(0, 3).map(evidenceRow)}
            </ul>
            {(dims.length ? shared : data.evidence).length > 3 && (
              <ExpandableDetail summary={`All ${(dims.length ? shared : data.evidence).length}`}>
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {(dims.length ? shared : data.evidence).slice(3).map(evidenceRow)}
                </ul>
              </ExpandableDetail>
            )}
          </div>
        )}
      </Block>

      {/* 4. The plan */}
      <Block id="plan" title="Your plan" lead="Targets and signals are our proposals; owners are your call.">
        <div className="grid md:grid-cols-3 gap-3">
          {STAGES.map((st) => {
            const here = data.plan.filter((a) => a.timing === st.timing);
            return (
              <div key={st.timing} className="rounded-xl p-3 space-y-2.5" style={{ background: "var(--muted)" }} aria-label={`${st.label}: ${st.days}`}>
                <div className="flex items-baseline justify-between px-0.5">
                  <h3 className="text-sm font-semibold" style={fg}>
                    {st.label}
                  </h3>
                  <span data-label className="text-[11px] font-mono" style={{ color: "var(--subtle-foreground)" }}>
                    {st.days}
                  </span>
                </div>
                {here.length ? (
                  <ol className="space-y-2.5">{here.map(actionCard)}</ol>
                ) : (
                  <p data-label className="text-xs px-0.5" style={muted}>
                    Nothing staged yet
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Block>

      {/* 5. The numbers */}
      <Block id="numbers" title="Your numbers">
        {data.baseline.length > 3 && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{data.baseline.slice(3, 11).map(tile)}</div>}
        {benchmarkNote}
        {compareHref && (
          <p className="text-sm">
            <Link href={compareHref} className="link inline-flex items-center gap-1">
              <Users size={14} aria-hidden /> See how you compare with peers on growth, retention and revenue →
            </Link>
          </p>
        )}
        {figures}
      </Block>

      {/* 5. Explore the details */}
      <Block id="details" title="Explore the details">
        <div className="space-y-3">
          <Detail title="Options considered" count={data.alternatives.length}>
            {data.alternatives.length === 0 ? (
              <p className="text-base" style={muted}>No alternatives were set out in this version of the brief.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {data.alternatives.map((a) => (
                  <div key={a.claimKey} className="rounded-xl border p-4 text-base" style={{ borderColor: "var(--border)" }}>
                    <div className="flex gap-2 items-start mb-2">
                      <div className="flex-1 font-semibold" style={fg}>{a.option}</div>
                      {evidence(a.claimKey)}
                    </div>
                    <dl className="space-y-1.5 text-sm" style={muted}>
                      <div><dt className="inline font-semibold" style={{ color: "var(--green)" }}>Upside: </dt><dd className="inline">{a.upside}</dd></div>
                      <div><dt className="inline font-semibold" style={{ color: "var(--red)" }}>Downside: </dt><dd className="inline">{a.downside}</dd></div>
                      <div><dt className="inline font-semibold" style={fg}>What it means: </dt><dd className="inline">{a.implications}</dd></div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </Detail>

          <Detail title="Other explanations and what isn't known yet" count={data.diagnosis.alternatives.length + data.diagnosis.unknowns.length}>
            {data.diagnosis.alternatives.length > 0 && (
              <ul className="space-y-3 mb-4">
                {data.diagnosis.alternatives.map((a) => (
                  <li key={a.claimKey} className="flex gap-3 items-start text-base">
                    <div className="flex-1"><span className="font-semibold" style={fg}>{a.title}. </span><span style={muted}>{a.assessment}</span></div>
                    {evidence(a.claimKey)}
                  </li>
                ))}
              </ul>
            )}
            {data.diagnosis.unknowns.length > 0 ? (
              <>
                <div className="label mb-1">Not known yet</div>
                <ul className="text-base space-y-1" style={muted}>{data.diagnosis.unknowns.map((u) => <li key={u}>• {u}</li>)}</ul>
              </>
            ) : (
              data.diagnosis.alternatives.length === 0 && <p className="text-base" style={muted}>Nothing else to report.</p>
            )}
          </Detail>

          <Detail title="What would change this recommendation" count={data.changeTriggers.length}>
            {data.changeTriggers.length === 0 ? (
              <p className="text-base" style={muted}>New data that changes the diagnosis. Reassess when it arrives.</p>
            ) : (
              <ul className="space-y-2 text-base">
                {data.changeTriggers.map((t) => (
                  <li key={t.ifThis} style={fg}>
                    <span className="font-semibold">If {midSentence(t.ifThis.replace(/^if\s+/i, ""))}</span>
                    <span style={muted}> → {t.thenThis}</span>
                  </li>
                ))}
              </ul>
            )}
          </Detail>

          <Detail title="Follow-up and when to reassess">
            {data.followUp.metrics.length > 0 && (
              <ul className="space-y-1 mb-3 text-base">
                {data.followUp.metrics.map((m) => (
                  <li key={m.label} style={fg}><span className="font-semibold">{m.label}</span><span style={muted}> · {m.why}</span></li>
                ))}
              </ul>
            )}
            <p className="text-base" style={fg}>
              Revisit by <span className="font-semibold">{date(data.followUp.revisitBy)}</span> ({data.followUp.revisitInDays} days)
              {data.followUp.revisitTrigger && <span style={muted}>, or sooner if {midSentence(data.followUp.revisitTrigger.replace(/^(revisit )?(sooner )?(if )?/i, "").replace(/\.$/, ""))}.</span>}
            </p>
          </Detail>

          <Detail title="All your figures" count={data.baseline.length}>
            {data.baseline.length === 0 ? (
              <p className="text-base" style={muted}>No figures could be read from your data yet, so this brief rests on your answers and the data you described.</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left" style={muted}>
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
                        <td className="py-2.5 px-1 font-semibold" style={fg}>{r.value}</td>
                        <td className="py-2.5 px-1" style={muted}>
                          {r.period && r.period !== "Current" && <div style={fg}>{r.period}</div>}
                          <div>{ORIGIN[r.origin]}{r.sampleSize !== null && ` · ${r.sampleSize} records`}</div>
                          {r.method && <div className="mt-0.5">{r.method}</div>}
                          {!r.confirmed && <div style={{ color: "var(--amber)" }}>Not confirmed yet</div>}
                          {r.stale && <div style={{ color: "var(--amber)" }}>More than 90 days old</div>}
                        </td>
                        {hasPrevious && (
                          <td className="py-2.5 px-1" style={muted}>
                            {r.previous ? `${r.previous.value} (${r.previous.direction === "better" ? "better now" : r.previous.direction === "worse" ? "worse now" : "no change"})` : "—"}
                          </td>
                        )}
                        {hasPeers && <td className="py-2.5 px-1" style={muted}>{r.median ?? "—"} / {r.topQuartile ?? "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Detail>

          {data.analyses.length > 0 && (
            <Detail title="Calculations from your files" count={data.analyses.length}>
              <div className="grid sm:grid-cols-2 gap-3">
                {data.analyses.map((t) => (
                  <div key={t.title} className="rounded-lg border p-4 text-sm" style={{ borderColor: "var(--border)" }}>
                    <div className="font-semibold mb-1.5" style={fg}>{t.title}</div>
                    <ul className="space-y-0.5 font-mono" style={muted}>{t.rows.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                ))}
              </div>
            </Detail>
          )}

          <Detail title="Assumptions, gaps and method">
            <div className="label mb-1">Confidence in your inputs: {confidence.level}</div>
            <ul className="text-base space-y-1 mb-4" style={muted}>{confidence.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
            {data.assumptions.length > 0 && (
              <>
                <div className="label mb-1">Assumptions</div>
                <ul className="text-base space-y-1 mb-4" style={muted}>{data.assumptions.map((a) => <li key={a}>• {a}</li>)}</ul>
              </>
            )}
            {data.dataGaps.length > 0 && (
              <>
                <div className="label mb-1">Data gaps</div>
                <ul className="text-base space-y-1 mb-4" style={muted}>{data.dataGaps.map((a) => <li key={a}>• {a}</li>)}</ul>
              </>
            )}
            <p className="text-sm" style={muted}><span className="font-semibold">Method: </span>{data.methodology}</p>
          </Detail>
        </div>
        {nextUseCase && (
          <p className="text-base" style={fg}>
            A good next question: <Link href={nextUseCase.href} className="link">{nextUseCase.question}</Link>
          </p>
        )}
      </Block>

      {advisory}
    </div>
  );
}
