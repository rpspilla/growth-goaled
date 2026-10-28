import { findRange, rangeFieldId } from "@/lib/ranges";
import type { UseCaseDef, UseCaseId } from "./types";

/**
 * The free Growth Snapshot: early hypotheses from what the founder has told us
 * (questionnaire + company profile), computed in code. It never uses peer
 * benchmarks or invents figures: every signal quotes the founder's own answer
 * or simple arithmetic on it, and is labelled a hypothesis to test with data. Figures may be exact
 * (from the profile) or a range the founder picked; a range is quoted as a range, never a number.
 */

type Status = "not_reviewed" | "available" | "partial" | "missing" | "not_applicable";
type Value = string | number | null | undefined;

export type SnapshotSignal = {
  kind: "watch" | "positive" | "info";
  title: string;
  detail: string;
  /** What it's based on, e.g. "Your answer: NRR 94%". */
  basis: string;
};

export type Snapshot = {
  signals: SnapshotSignal[];
  fit: { good: boolean; note: string; suggested: UseCaseId | null };
  /** Required data for the full assessment, and whether it's already in. */
  dataNeeded: { key: string; have: boolean }[];
  /** True when no figures were available, so signals rest on written answers only. */
  answersOnly: boolean;
};

export type SnapshotInput = {
  useCase: Pick<UseCaseDef, "id" | "requiredItems">;
  objective: Readonly<Record<string, string>>;
  /** Intake answers keyed "section.field" (lib/intake.ts). */
  profile: Readonly<Record<string, Value>>;
  dataStatus: Readonly<Record<string, Status>>;
};

const num = (v: Value): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
/** A figure as the founder gave it: exact (lo = hi) or a range, with how to quote it. */
type Fig = { lo: number | null; hi: number | null; exact: number | null; text: string };
const lowerFirst = (t: string) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
function figure(profile: Readonly<Record<string, Value>>, key: string, format: (n: number) => string): Fig | null {
  const n = num(profile[key]);
  if (n !== null) return { lo: n, hi: n, exact: n, text: format(n) };
  const [section, field] = key.split(".") as [string, string];
  const range = findRange(key, profile[`${section}.${rangeFieldId(field)}`]);
  return range ? { lo: range.lo, hi: range.hi, exact: null, text: lowerFirst(range.label) } : null;
}
/** Whole-number ratio range for a / (a range), e.g. budget over ACV; null when the range is open at zero. */
const ratio = (a: number, f: Fig, round: (x: number) => number): string | null => {
  if (f.exact !== null) return f.exact > 0 ? String(round(a / f.exact)) : null;
  if (!f.lo || !f.hi) return null;
  const lo = round(a / f.hi);
  const hi = round(a / f.lo);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
};
const pct = (n: number) => `${n}%`;

const usd = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${+(n / 1_000).toFixed(0)}K` : `$${n}`);
const monthsUntil = (iso: string, now: Date) => {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - now.getTime()) / (30.44 * 24 * 3600 * 1000));
};

export function growthSnapshot(input: SnapshotInput, now = new Date()): Snapshot {
  const { useCase, objective, profile } = input;
  const signals: SnapshotSignal[] = [];
  const stage = typeof profile["company.stage"] === "string" ? (profile["company.stage"] as string) : null;
  const model = typeof profile["gtm.model"] === "string" ? (profile["gtm.model"] as string) : null;
  const growth = figure(profile, "company.growth", pct);
  const nrr = figure(profile, "customers.nrr", pct);
  // Stored as gross retention, asked and quoted as annual gross churn (100% minus it).
  const grr = figure(profile, "customers.gross_retention", (n) => `${+(100 - n).toFixed(1)}%`);
  const arr = figure(profile, "company.arr", usd);
  const reps = figure(profile, "gtm.sales_reps", String);
  const cycle = figure(profile, "customers.sales_cycle", (n) => `${n} days`);
  const acv = figure(profile, "customers.acv", usd);
  const customers = figure(profile, "customers.count", String);
  const employees = figure(profile, "company.employees", String);
  // Exact figures compare as before; a range only counts when the whole range is on one side.
  const below = (f: Fig | null, x: number) => f !== null && (f.exact !== null ? f.exact < x : f.hi !== null && f.hi <= x);
  const atLeast = (f: Fig | null, x: number) => f !== null && (f.exact !== null ? f.exact >= x : f.lo !== null && f.lo >= x);
  const noneOf = (f: Fig | null) => f !== null && (f.exact !== null ? f.exact === 0 : f.hi === 0);
  const founderLed = model === "Founder-led";

  const retention = () => {
    if (nrr && below(nrr, 100))
      signals.push({ kind: "watch", title: "Your existing customers shrink on net", detail: `An NRR of ${nrr.text} means the revenue base gets smaller each year before any new sales are added, so new business has to make up the difference.`, basis: `Your answer: NRR ${nrr.text}` });
    else if (nrr && atLeast(nrr, 100))
      signals.push({ kind: "positive", title: "Your customer base grows on its own", detail: `An NRR of ${nrr.text} means existing customers expand by more than you lose to churn.`, basis: `Your answer: NRR ${nrr.text}` });
    const lost =
      grr === null ? null
      : grr.exact !== null ? (grr.exact < 100 ? `About ${+(100 - grr.exact).toFixed(1)}%` : null)
      : grr.lo === null ? `More than ${100 - grr.hi!}%`
      : grr.hi !== null && grr.hi >= 100 ? `Up to ${100 - grr.lo}%`
      : `About ${100 - grr.hi!}–${100 - grr.lo}%`;
    if (grr && lost)
      signals.push({ kind: "info", title: `${lost} of starting revenue is lost each year`, detail: "That's churn plus downgrades, before expansion. The assessment shows which customers it comes from.", basis: `Your answer: annual gross churn ${grr.text}` });
  };
  const growthSignal = () => {
    if (growth && (growth.exact !== null ? growth.exact <= 0 : growth.hi !== null && growth.hi <= 0))
      signals.push({ kind: "watch", title: "Revenue isn't growing year over year", detail: "Flat or falling revenue usually has more than one cause; the full assessment separates them.", basis: `Your answer: YoY growth ${growth.text}` });
  };

  let fit: Snapshot["fit"] = { good: true, note: "This assessment fits what you've told us.", suggested: null };

  switch (useCase.id) {
    case "growth_leak": {
      growthSignal();
      retention();
      if (growth && (growth.exact !== null ? growth.exact > 0 : growth.lo !== null && growth.lo >= 0) && atLeast(nrr, 100))
        signals.push({ kind: "info", title: "If there's a leak, it's more likely in new business", detail: "Retention looks healthy on what you told us, so the assessment will look hardest at pipeline volume and conversion.", basis: "Your NRR and growth answers" });
      break;
    }
    case "series_a_ready":
    case "series_b_ready": {
      const round = useCase.id === "series_a_ready" ? "Series A" : "Series B";
      if (useCase.id === "series_a_ready" && (stage === "Series A" || stage === "Series B+"))
        fit = { good: false, note: `You've told us you're at ${stage}, so the Series B readiness assessment is likely the better fit.`, suggested: "series_b_ready" };
      if (useCase.id === "series_b_ready" && (stage === "Pre-seed" || stage === "Seed"))
        fit = { good: false, note: `You've told us you're at ${stage}, so the Series A readiness assessment is likely the better fit.`, suggested: "series_a_ready" };
      growthSignal();
      retention();
      const close = objective.raise_close_date ? monthsUntil(objective.raise_close_date, now) : null;
      if (close !== null && close <= 0)
        signals.push({ kind: "watch", title: "Your target close date has passed", detail: "Update it so the plan's timing is right.", basis: `Your answer: close by ${objective.raise_close_date}` });
      else if (close !== null)
        signals.push({ kind: "info", title: `About ${close} ${close === 1 ? "month" : "months"} until your target close`, detail: "The assessment's improvement plan is sequenced to fit that window, and checks it against your runway.", basis: `Your answer: close by ${objective.raise_close_date}` });
      const raise = num(objective.raise_amount);
      const multiple = raise !== null && arr ? ratio(raise, arr, (x) => +x.toFixed(1)) : null;
      if (raise !== null && arr && multiple)
        signals.push({ kind: "info", title: `You're raising about ${multiple}× your current ARR`, detail: `Investors will test whether the plan for that capital is credible; the assessment shows which metrics support it.`, basis: `Your answers: raise ${usd(raise)}, ARR ${arr.text}` });
      if (founderLed)
        signals.push({ kind: "watch", title: "Investors will ask whether sales work without you", detail: `Founder-led sales is common at this stage, but GTM repeatability is a ${round} question. Founder Handoff looks at it in depth.`, basis: "Your answer: founder-led sales" });
      signals.push({ kind: "info", title: "Runway isn't known yet", detail: "Raise timing is judged against runway; the assessment needs cash balances and burn to work it out.", basis: "Needs your financial data" });
      break;
    }
    case "hire_or_fix": {
      if (noneOf(reps))
        fit = { good: false, note: "You don't have salespeople yet, so the question is who to hire first. Founder Handoff is built for that.", suggested: "founder_handoff" };
      if (reps && atLeast(reps, 1))
        signals.push({ kind: "info", title: `${reps.text} ${reps.exact === 1 ? "rep" : "reps"} today`, detail: "The assessment measures what each one produces and how long new reps take to ramp, before recommending more.", basis: `Your answer: ${reps.text} AEs` });
      const budget = num(objective.hiring_budget);
      const deals = budget !== null && acv ? ratio(budget, acv, Math.ceil) : null;
      if (budget !== null && acv && deals)
        signals.push({ kind: "info", title: `Your hiring budget equals about ${deals} deals at your ACV`, detail: "New hires need to close at least that much new business to pay for themselves within a year, before ramp time.", basis: `Your answers: budget ${usd(budget)}, ACV ${acv.text}` });
      if (cycle)
        signals.push({ kind: "info", title: `A sales cycle of ${cycle.text} delays a new rep's first revenue`, detail: "Deals a new rep sources won't close for at least one sales cycle, so ramp time matters to the decision.", basis: `Your answer: ${cycle.text} sales cycle` });
      if (founderLed)
        signals.push({ kind: "watch", title: "Founder-led sales can hide a missing process", detail: "New reps need a process they can follow without you; the assessment checks whether one exists.", basis: "Your answer: founder-led sales" });
      break;
    }
    case "winning_icp": {
      if (customers && below(customers, 20))
        signals.push({ kind: "watch", title: "Segment comparisons will be directional", detail: `With ${customers.text} customers, some segments will have only a few accounts. The assessment says where samples are small.`, basis: `Your answer: ${customers.text} customers` });
      const segment = typeof profile["customers.segment"] === "string" ? profile["customers.segment"] : null;
      if (segment === "Mixed")
        signals.push({ kind: "info", title: "You sell across several segments", detail: "That's where this assessment helps most: it ranks them on win rate, deal size, cycle and retention.", basis: "Your answer: mixed segments" });
      if (objective.believed_segments)
        signals.push({ kind: "info", title: "Your hypothesis to test", detail: `“${objective.believed_segments.slice(0, 200)}”. The assessment checks it against your won, lost and retained customers.`, basis: "Your answer" });
      break;
    }
    case "founder_handoff": {
      const share = num(objective.founder_deal_share);
      if (share !== null && share >= 70)
        signals.push({ kind: "watch", title: "Sales depend heavily on you", detail: `Being in about ${share}% of deals means most revenue currently relies on your time.`, basis: `Your answer: ${share}% of deals` });
      else if (share !== null && share < 30)
        signals.push({ kind: "positive", title: "The team already sells most deals without you", detail: `At about ${share}% involvement, the question may be scaling the team rather than handing off.`, basis: `Your answer: ${share}% of deals` });
      if (share !== null && share < 30 && reps && (reps.exact !== null ? reps.exact > 1 : reps.lo !== null && reps.lo > 1))
        fit = { good: false, note: "You're in few deals and already have reps, so Hire or Fix may answer your question better.", suggested: "hire_or_fix" };
      if (noneOf(reps))
        signals.push({ kind: "info", title: "No reps yet", detail: "The assessment recommends whether your first hire should be an AE or a sales leader, and when.", basis: "Your answer: no AEs" });
      break;
    }
  }

  const answered = [growth, nrr, grr, arr, reps, cycle, acv, customers, employees].some((v) => v !== null);
  if (!signals.length)
    signals.push({ kind: "info", title: "Not enough to go on yet", detail: "Add a few figures above, or share your data in the full assessment, and we'll point to where to look.", basis: "Your answers so far" });
  return {
    signals,
    fit,
    dataNeeded: useCase.requiredItems.map((key) => ({ key, have: input.dataStatus[key] === "available" || input.dataStatus[key] === "partial" })),
    answersOnly: !answered,
  };
}
