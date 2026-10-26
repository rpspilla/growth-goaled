import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import type { FileAnalysis, SegmentRow } from "@/lib/metrics-engine";
import type { UseCaseId } from "@/lib/use-cases/types";

/**
 * Deterministic diagnostic rules (no model). From the company's calculated figures and file
 * analyses they produce candidate constraints, each with supporting and contradicting evidence
 * and an impact estimate where the arithmetic allows. The Draft Agent interprets these; it
 * doesn't invent its own. Certainty is decided here, by rule:
 *   established: the leading candidate rests on calculated figures and clearly outweighs the next;
 *   leading:     one candidate leads, but the margin or the evidence is thinner;
 *   unresolved:  the data can't separate the candidates (or there are none) — say so.
 */

export type Figure = { metric: MetricKey; value: number; period: string | null; origin: "manual" | "extracted" | "calculated"; confirmed: boolean; sampleSize?: number };

export type Evidence = { text: string; kind: "calculated" | "reported" | "inference" };

export type Candidate = {
  id: string;
  title: string;
  /** Annual revenue at stake, when it can be computed from the figures. */
  impactArr: number | null;
  /** Facts that describe the situation without pointing either way (not scored). */
  context: Evidence[];
  supporting: Evidence[];
  contradicting: Evidence[];
  /** The fastest way to confirm or rule it out. */
  test: string;
};

export type Diagnosis = {
  certainty: "established" | "leading" | "unresolved";
  candidates: Candidate[];
  /** What would most improve confidence, most valuable first. */
  unknowns: string[];
};

const f = (m: MetricKey, v: number) => formatMetric(m, v);
const usd = (v: number) => formatMetric("arr", v);

function fig(figures: Figure[], m: MetricKey): Figure | undefined {
  return figures.find((x) => x.metric === m);
}

/** "NRR 94% (calculated, Sep 2025 – Sep 2026)" */
export function cite(x: Figure): string {
  const how = x.origin === "calculated" ? "calculated" : x.origin === "manual" ? "you reported" : "read from a file";
  return `${METRICS[x.metric].label} ${f(x.metric, x.value)} (${how}${x.period && x.period !== "Current" ? `, ${x.period}` : ""}${x.confirmed ? "" : ", not confirmed"})`;
}

const kindOf = (x: Figure): Evidence["kind"] => (x.origin === "calculated" ? "calculated" : "reported");

function bestWorst(rows: SegmentRow[]) {
  const usable = rows.filter((r) => r.winRate !== null && !r.smallSample);
  if (usable.length < 2) return null;
  return { best: usable[0]!, worst: usable.at(-1)! };
}

function growthLeak(figures: Figure[], a: FileAnalysis[]): Candidate[] {
  const out: Candidate[] = [];
  const bridge = a.find((x) => x.bridge)?.bridge;
  const nrr = fig(figures, "nrr");
  const win = fig(figures, "win_rate");
  if (bridge) {
    const lost = bridge.churnedArr + bridge.contractionArr;
    const gained = bridge.newArr + bridge.expansionArr;
    const window = `${bridge.from} to ${bridge.to}`;
    out.push({
      id: "retention",
      title: "Revenue lost from existing customers (churn and contraction)",
      impactArr: lost,
      context: [{ text: `${usd(lost)} of ARR lost to churn (${usd(bridge.churnedArr)}) and contraction (${usd(bridge.contractionArr)}), ${window}.`, kind: "calculated" }],
      supporting: [
        ...(nrr && nrr.value < 100 ? [{ text: `${cite(nrr)}: the existing base shrinks before new sales.`, kind: kindOf(nrr) }] : []),
        ...(lost > bridge.newArr ? [{ text: `More ARR was lost (${usd(lost)}) than won from new customers (${usd(bridge.newArr)}).`, kind: "calculated" as const }] : []),
      ],
      contradicting: [
        ...(nrr && nrr.value >= 100 ? [{ text: `${cite(nrr)}: expansion outweighs losses.`, kind: kindOf(nrr) }] : []),
        ...(lost === 0 ? [{ text: `No churn or contraction in ${window}.`, kind: "calculated" as const }] : []),
      ],
      test: "List the churned and contracted accounts and check what they share (segment, onboarding, product usage, owner).",
    });
    out.push({
      id: "acquisition",
      title: "Too little new business (pipeline or conversion)",
      impactArr: null,
      context: [
        { text: `New customers added ${usd(bridge.newArr)} of ARR (${bridge.customersNew} customers), ${window}.`, kind: "calculated" },
        ...(win ? [{ text: `${cite(win)}${win.sampleSize !== undefined ? ` across ${win.sampleSize} closed deals` : ""}.`, kind: kindOf(win) }] : []),
      ],
      supporting: [
        ...(nrr && nrr.value >= 100 ? [{ text: `${cite(nrr)}: the existing base is growing, so a slowdown has to come from new business.`, kind: "inference" as const }] : []),
        ...(bridge.newArr < bridge.expansionArr ? [{ text: `New business (${usd(bridge.newArr)}) added less than expansion (${usd(bridge.expansionArr)}).`, kind: "calculated" as const }] : []),
      ],
      contradicting: bridge.newArr > lost ? [{ text: `New ARR (${usd(bridge.newArr)}) exceeded everything lost (${usd(lost)}).`, kind: "calculated" }] : [],
      test: "Split new business into pipeline created and win rate by month to see which one fell.",
    });
    if (bridge.customersStart >= 5) {
      out.push({
        id: "expansion",
        title: "Little expansion from existing customers",
        impactArr: null,
        context: [{ text: `Expansion added ${usd(bridge.expansionArr)} of ARR against ${usd(bridge.startArr)} starting ARR, ${window}.`, kind: "calculated" }],
        supporting: bridge.expansionArr < bridge.churnedArr ? [{ text: `Expansion (${usd(bridge.expansionArr)}) didn't offset churn (${usd(bridge.churnedArr)}).`, kind: "calculated" }] : [],
        contradicting: bridge.expansionArr >= gained / 2 ? [{ text: "Expansion was at least half of all ARR gained.", kind: "calculated" }] : [],
        test: "Check which customers have room to grow (seats, usage, modules) and whether anyone owns expansion.",
      });
    }
  } else if (nrr) {
    out.push({
      id: "retention",
      title: "Revenue lost from existing customers",
      impactArr: null,
      context: [],
      supporting: nrr.value < 100 ? [{ text: `${cite(nrr)}.`, kind: kindOf(nrr) }] : [],
      contradicting: nrr.value >= 100 ? [{ text: `${cite(nrr)}.`, kind: kindOf(nrr) }] : [],
      test: "Upload revenue by customer by month so churn, contraction and expansion can be calculated.",
    });
  }
  return out;
}

function hireOrFix(figures: Figure[], a: FileAnalysis[]): Candidate[] {
  const out: Candidate[] = [];
  const win = fig(figures, "win_rate");
  const cycle = fig(figures, "sales_cycle_days");
  const founder = fig(figures, "founder_closed_share");
  const pipe = a.find((x) => x.pipeline)?.pipeline;
  const sources = a.flatMap((x) => x.segments ?? []).find((s) => s.dimension === "Source" || s.dimension === "Segment");
  const spread = sources ? bestWorst(sources.rows) : null;
  out.push({
    id: "conversion",
    title: "Conversion: deals are lost that the current team should win",
    impactArr: null,
    context: [],
    supporting: [
      ...(win ? [{ text: `${cite(win)}.`, kind: kindOf(win) }] : []),
      ...(spread && spread.best.winRate! - spread.worst.winRate! >= 20
        ? [{ text: `Win rate ranges from ${spread.best.winRate}% (${spread.best.name}) to ${spread.worst.winRate}% (${spread.worst.name}) by ${sources!.dimension.toLowerCase()}.`, kind: "calculated" as const }]
        : []),
    ],
    contradicting: [],
    test: "Review the last 10 lost deals for the stage and reason they were lost.",
  });
  if (founder) {
    out.push({
      id: "founder_dependence",
      title: "Deals depend on the founder, so new reps would start without a proven process",
      impactArr: null,
      context: [],
      supporting: founder.value >= 50 ? [{ text: `${cite(founder)}.`, kind: kindOf(founder) }] : [],
      contradicting: founder.value < 50 ? [{ text: `${cite(founder)}: most won deals already close without the founder.`, kind: kindOf(founder) }] : [],
      test: "Compare win rate and cycle for founder-owned vs rep-owned deals.",
    });
  }
  if (pipe) {
    out.push({
      id: "pipeline",
      title: "Not enough pipeline for more reps to work",
      impactArr: null,
      context: [{ text: `${pipe.openCount} open deals worth ${usd(pipe.openAmount)}${pipe.asOf !== "unknown" ? ` as of ${pipe.asOf}` : ""}.`, kind: "calculated" }],
      supporting: [],
      contradicting: [],
      test: "Divide open pipeline by each rep's quarterly quota to get coverage per rep.",
    });
  }
  if (cycle) out[0]!.context.push({ text: `${cite(cycle)}: a new rep needs at least one cycle before their first close.`, kind: kindOf(cycle) });
  return out;
}

function winningIcp(a: FileAnalysis[]): Candidate[] {
  return a
    .flatMap((x) => x.segments ?? [])
    .filter((s) => s.dimension !== "Owner")
    .flatMap((s) => {
      const bw = bestWorst(s.rows);
      if (!bw) return [];
      const small = s.rows.filter((r) => r.smallSample).map((r) => r.name);
      return [
        {
          id: `segment_${s.dimension.toLowerCase().replace(/\s/g, "_")}`,
          title: `${bw.best.name} is the strongest ${s.dimension.toLowerCase()}`,
          impactArr: null,
          context: [],
          supporting: [{ text: `${bw.best.name}: ${bw.best.winRate}% win rate (${bw.best.won} won, ${bw.best.lost} lost)${bw.best.avgWonAmount ? `, average won deal ${usd(bw.best.avgWonAmount)}` : ""}; ${bw.worst.name}: ${bw.worst.winRate}%.`, kind: "calculated" as const }],
          contradicting: small.length ? [{ text: `Too few closed deals to compare: ${small.join(", ")}.`, kind: "calculated" as const }] : [],
          test: `Check retention and expansion for ${bw.best.name} customers, not just win rate.`,
        },
      ];
    });
}

function founderHandoff(figures: Figure[], a: FileAnalysis[]): Candidate[] {
  const founder = fig(figures, "founder_closed_share");
  const owners = a.flatMap((x) => x.segments ?? []).find((s) => s.dimension === "Owner");
  const out: Candidate[] = [];
  out.push({
    id: "founder_dependence",
    title: "Sales still depend on the founder",
    impactArr: null,
    context: [],
    supporting: founder && founder.value >= 50 ? [{ text: `${cite(founder)}.`, kind: kindOf(founder) }] : [],
    contradicting: founder && founder.value < 50 ? [{ text: `${cite(founder)}.`, kind: kindOf(founder) }] : [],
    test: "Have a rep run a set of deals end to end and compare their win rate with yours.",
  });
  if (owners && owners.rows.length >= 2) {
    const rows = owners.rows.filter((r) => r.winRate !== null);
    if (rows.length >= 2)
      out[0]!.context.push({ text: `Win rate by owner: ${rows.map((r) => `${r.name} ${r.winRate}%${r.smallSample ? " (few deals)" : ""}`).join(", ")}.`, kind: "calculated" });
  }
  return out;
}

function fundraise(figures: Figure[]): Candidate[] {
  const runway = fig(figures, "runway_months");
  const growth = fig(figures, "arr_growth") ?? fig(figures, "mom_growth");
  const nrr = fig(figures, "nrr");
  const conc = fig(figures, "top_customer_concentration");
  const out: Candidate[] = [];
  if (runway) out.push({ id: "runway", title: "Runway against raise timing", impactArr: null, context: [], supporting: [{ text: `${cite(runway)}.`, kind: kindOf(runway) }], contradicting: [], test: "Line up the raise timeline (start, first close) against the runway month by month." });
  if (nrr) out.push({ id: "retention", title: "Retention as a diligence question", impactArr: null, context: [], supporting: nrr.value < 100 ? [{ text: `${cite(nrr)}.`, kind: kindOf(nrr) }] : [], contradicting: nrr.value >= 100 ? [{ text: `${cite(nrr)}.`, kind: kindOf(nrr) }] : [], test: "Show retention by customer cohort, not just one blended figure." });
  if (conc) out.push({ id: "concentration", title: "Revenue concentration", impactArr: null, context: [], supporting: conc.value >= 20 ? [{ text: `${cite(conc)}.`, kind: kindOf(conc) }] : [], contradicting: conc.value < 20 ? [{ text: `${cite(conc)}.`, kind: kindOf(conc) }] : [], test: "List the largest customers' renewal dates and expansion plans." });
  if (growth) out.push({ id: "growth", title: "Growth rate and consistency", impactArr: null, context: [{ text: `${cite(growth)}.`, kind: kindOf(growth) }], supporting: [], contradicting: [], test: "Plot monthly new ARR for the last 12 months to show consistency." });
  return out;
}

/** The figures each decision rests on most; missing ones become unknowns. */
export const KEY_METRICS: Record<UseCaseId, MetricKey[]> = {
  growth_leak: ["nrr", "grr", "new_arr", "churned_arr", "win_rate"],
  series_a_ready: ["arr", "arr_growth", "nrr", "runway_months", "gross_margin", "top_customer_concentration"],
  series_b_ready: ["arr", "arr_growth", "nrr", "gross_margin", "burn_multiple", "runway_months"],
  hire_or_fix: ["win_rate", "sales_cycle_days", "quota_attainment", "founder_closed_share"],
  winning_icp: ["win_rate", "acv", "sales_cycle_days", "nrr"],
  founder_handoff: ["founder_closed_share", "win_rate", "sales_cycle_days"],
};

/** Runs the rules for a use case. Pure and deterministic. */
export function diagnose(useCase: UseCaseId, figures: Figure[], analyses: FileAnalysis[]): Diagnosis {
  const raw =
    useCase === "growth_leak"
      ? growthLeak(figures, analyses)
      : useCase === "hire_or_fix"
        ? hireOrFix(figures, analyses)
        : useCase === "winning_icp"
          ? winningIcp(analyses)
          : useCase === "founder_handoff"
            ? founderHandoff(figures, analyses)
            : fundraise(figures);
  // Rank: evidence that supports minus evidence against, then ARR at stake; calculated evidence counts double.
  const weight = (e: Evidence[]) => e.reduce((s, x) => s + (x.kind === "calculated" ? 2 : 1), 0);
  const score = (c: Candidate) => weight(c.supporting) - weight(c.contradicting);
  const candidates = raw.filter((c) => c.supporting.length || c.contradicting.length || c.context.length).sort((x, y) => score(y) - score(x) || (y.impactArr ?? 0) - (x.impactArr ?? 0));

  const top = candidates[0];
  const second = candidates[1];
  const topCalculated = top ? top.supporting.some((e) => e.kind === "calculated") : false;
  const margin = top ? score(top) - (second ? score(second) : 0) : 0;
  const certainty: Diagnosis["certainty"] = !top || score(top) <= 0 ? "unresolved" : topCalculated && margin >= 2 && !top.contradicting.length ? "established" : margin >= 1 ? "leading" : "unresolved";

  const have = new Set(figures.map((x) => x.metric));
  const unknowns = KEY_METRICS[useCase].filter((m) => !have.has(m)).map((m) => `${METRICS[m].label} isn't available yet.`);
  const unconfirmed = figures.filter((x) => !x.confirmed && KEY_METRICS[useCase].includes(x.metric));
  if (unconfirmed.length) unknowns.push(`${unconfirmed.map((x) => METRICS[x.metric].label).join(", ")} ${unconfirmed.length === 1 ? "isn't" : "aren't"} confirmed yet.`);
  for (const x of figures) if (x.sampleSize !== undefined && x.sampleSize < 10 && KEY_METRICS[useCase].includes(x.metric)) unknowns.push(`${METRICS[x.metric].label} rests on only ${x.sampleSize} records.`);
  return { certainty, candidates, unknowns };
}
