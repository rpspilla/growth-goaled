import type { UseCaseDef, UseCaseId } from "./types";

/**
 * The free Growth Snapshot: early hypotheses from what the founder has told us
 * (questionnaire + company profile), computed in code. It never uses peer
 * benchmarks or invents figures: every signal quotes the founder's own answer
 * or simple arithmetic on it, and is labelled a hypothesis to test with data.
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
  const growth = num(profile["company.growth"]);
  const nrr = num(profile["customers.nrr"]);
  const grr = num(profile["customers.gross_retention"]);
  const arr = num(profile["company.arr"]);
  const reps = num(profile["gtm.sales_reps"]);
  const cycle = num(profile["customers.sales_cycle"]);
  const acv = num(profile["customers.acv"]);
  const customers = num(profile["customers.count"]);
  const founderLed = model === "Founder-led";

  const retention = () => {
    if (nrr !== null && nrr < 100)
      signals.push({ kind: "watch", title: "Your existing customers shrink on net", detail: `An NRR of ${nrr}% means the revenue base gets smaller each year before any new sales are added, so new business has to make up the difference.`, basis: `Your answer: NRR ${nrr}%` });
    else if (nrr !== null)
      signals.push({ kind: "positive", title: "Your customer base grows on its own", detail: `An NRR of ${nrr}% means existing customers expand by more than you lose to churn.`, basis: `Your answer: NRR ${nrr}%` });
    if (grr !== null && grr < 100)
      signals.push({ kind: "info", title: `About ${+(100 - grr).toFixed(1)}% of starting revenue is lost each year`, detail: "That's churn plus downgrades, before expansion. The assessment shows which customers it comes from.", basis: `Your answer: gross retention ${grr}%` });
  };
  const growthSignal = () => {
    if (growth !== null && growth <= 0)
      signals.push({ kind: "watch", title: "Revenue isn't growing year over year", detail: "Flat or falling revenue usually has more than one cause; the full assessment separates them.", basis: `Your answer: YoY growth ${growth}%` });
  };

  let fit: Snapshot["fit"] = { good: true, note: "This assessment fits what you've told us.", suggested: null };

  switch (useCase.id) {
    case "growth_leak": {
      growthSignal();
      retention();
      if (growth !== null && growth > 0 && nrr !== null && nrr >= 100)
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
      if (raise !== null && arr !== null && arr > 0)
        signals.push({ kind: "info", title: `You're raising about ${+(raise / arr).toFixed(1)}× your current ARR`, detail: `Investors will test whether the plan for that capital is credible; the assessment shows which metrics support it.`, basis: `Your answers: raise ${usd(raise)}, ARR ${usd(arr)}` });
      if (founderLed)
        signals.push({ kind: "watch", title: "Investors will ask whether sales work without you", detail: `Founder-led sales is common at this stage, but GTM repeatability is a ${round} question. Founder Handoff looks at it in depth.`, basis: "Your answer: founder-led sales" });
      signals.push({ kind: "info", title: "Runway isn't known yet", detail: "Raise timing is judged against runway; the assessment needs cash balances and burn to work it out.", basis: "Needs your financial data" });
      break;
    }
    case "hire_or_fix": {
      if (reps === 0)
        fit = { good: false, note: "You don't have salespeople yet, so the question is who to hire first. Founder Handoff is built for that.", suggested: "founder_handoff" };
      if (reps !== null && reps > 0)
        signals.push({ kind: "info", title: `${reps} ${reps === 1 ? "rep" : "reps"} today`, detail: "The assessment measures what each one produces and how long new reps take to ramp, before recommending more.", basis: `Your answer: ${reps} AEs` });
      const budget = num(objective.hiring_budget);
      if (budget !== null && acv !== null && acv > 0)
        signals.push({ kind: "info", title: `Your hiring budget equals about ${Math.ceil(budget / acv)} deals at your ACV`, detail: "New hires need to close at least that much new business to pay for themselves within a year, before ramp time.", basis: `Your answers: budget ${usd(budget)}, ACV ${usd(acv)}` });
      if (cycle !== null)
        signals.push({ kind: "info", title: `A ${cycle}-day sales cycle delays a new rep's first revenue`, detail: "Deals a new rep sources won't close for at least one sales cycle, so ramp time matters to the decision.", basis: `Your answer: ${cycle}-day sales cycle` });
      if (founderLed)
        signals.push({ kind: "watch", title: "Founder-led sales can hide a missing process", detail: "New reps need a process they can follow without you; the assessment checks whether one exists.", basis: "Your answer: founder-led sales" });
      break;
    }
    case "winning_icp": {
      if (customers !== null && customers < 20)
        signals.push({ kind: "watch", title: "Segment comparisons will be directional", detail: `With ${customers} customers, some segments will have only a few accounts. The assessment says where samples are small.`, basis: `Your answer: ${customers} customers` });
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
      if (share !== null && share < 30 && reps !== null && reps > 1)
        fit = { good: false, note: "You're in few deals and already have reps, so Hire or Fix may answer your question better.", suggested: "hire_or_fix" };
      if (reps === 0)
        signals.push({ kind: "info", title: "No reps yet", detail: "The assessment recommends whether your first hire should be an AE or a sales leader, and when.", basis: "Your answer: no AEs" });
      break;
    }
  }

  const answered = [growth, nrr, grr, arr, reps, cycle, acv, customers].some((v) => v !== null);
  if (!signals.length)
    signals.push({ kind: "info", title: "Not enough to go on yet", detail: "Add a few figures above, or share your data in the full assessment, and we'll point to where to look.", basis: "Your answers so far" });
  return {
    signals,
    fit,
    dataNeeded: useCase.requiredItems.map((key) => ({ key, have: input.dataStatus[key] === "available" || input.dataStatus[key] === "partial" })),
    answersOnly: !answered,
  };
}
