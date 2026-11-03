import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Section } from "@/components/ui/Section";
import { Sparkline } from "@/components/ui/Sparkline";
import { assessmentCompletions, founderAssessment } from "@/lib/data/assessments";
import { founderContext } from "@/lib/data/founder-context";
import { listConversations } from "@/lib/data/chat";
import { founderPlans, REVIEW_HOURS } from "@/lib/data/action-plans";
import { CHAT_TOPICS } from "@/lib/chat/topics";
import { ChatStart } from "@/components/chat/ChatStart";
import { startChatAction } from "../chat/actions";
import { getIntakeAnswers } from "@/lib/data/intake";
import { snapshotPeers } from "@/lib/data/peers";
import { PeerComparisons } from "@/components/use-cases/PeerComparisons";
import { companyPerformance } from "@/lib/data/performance";
import { progressView } from "@/lib/data/plan";
import { formatMetric, METRICS } from "@/lib/metrics";
import type { PeerComparison } from "@/lib/benchmark-library/peers";
import { HEADLINE_METRICS } from "@/lib/performance";
import { formatPrice, pricing } from "@/lib/pricing";
import { firstUseCase, getUseCase, targetSummary } from "@/lib/use-cases";
import { journeyStage, nextAction } from "@/lib/use-cases/steps";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  objective: { label: "Snapshot · not purchased", tone: "neutral" },
  active: { label: "Sharing data", tone: "amber" },
  baseline_in_review: { label: "Analysis started", tone: "amber" },
  tracking: { label: "Plan in progress", tone: "green" },
  closed: { label: "Closed", tone: "neutral" },
};
const CERTAINTY: Record<string, { label: string; tone: Tone }> = {
  established: { label: "Established", tone: "green" },
  leading: { label: "Most likely", tone: "amber" },
  unresolved: { label: "Not yet established", tone: "red" },
};
const ACTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "amber" },
  done: { label: "Done", tone: "green" },
  dropped: { label: "Dropped", tone: "neutral" },
};
const TIMING: Record<string, string> = { next_30_days: "Days 1–30", days_31_60: "Days 31–60", days_61_90: "Days 61–90" };

/** What a founder sees at each stage before results exist: one sentence and one button. */
const STAGE_COPY = [
  { title: "Want an answer built from your own data?", body: "Pick a growth question for a free Growth Snapshot from one file, then build an action plan in the conversation when you're ready." },
  { title: "Share your data to get your answer", body: "Your assessment is ready for your data. Share what you have; it works with whatever you've got and says what's missing." },
  { title: "Your results are being built", body: "We're working through your answers and figures and checking every number. This usually takes a few minutes." },
  { title: "Keep your plan moving", body: "Track your actions and the metrics they should move." },
];

/**
 * One line on where the company stands against its benchmarks, from the comparisons already shown
 * (never a new figure): how many are against real peers, and which sit at or above the median.
 */
function benchmarkLead(peers: PeerComparison[]): string {
  const real = peers.filter((p): p is Extract<PeerComparison, { status: "compared" }> => p.status === "compared");
  const placed = real.filter((p) => p.company && p.median && p.position);
  // An exact figure, or a range wholly on one side of the median (a straddling range counts as neither).
  const ahead = placed.filter((p) => {
    const f = p.company!;
    const m = p.median!.value;
    if (METRICS[p.metric].lowerIsBetter) return f.exact !== null ? f.exact <= m : f.hi !== null && f.hi <= m;
    return f.exact !== null ? f.exact >= m : f.lo !== null && f.lo >= m;
  });
  if (!real.length) return "No published peer data matches your vertical and founding year yet, so these use Growth Goaled's standard reference, labelled as an assumption.";
  const base = `${real.length} of ${peers.length} compared with published peers in your vertical and founding years.`;
  if (!placed.length) return `${base} Add your figures on your profile or share data to see where you sit.`;
  return `${base} ${ahead.length ? `At or above the median on ${ahead.map((p) => p.title.toLowerCase()).join(" and ")}.` : "None is at or above the median yet."}`;
}

/** Growth Command Center: the main finding, the numbers that matter, the next three actions, and where each question stands. */
// A starter is answered before the conversation opens.
export const maxDuration = 300;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { user, company, useCases, active } = await founderContext();
  const state = active && { useCase: active.def.id, status: active.status };
  const started = useCases.find((u) => !u.activatedAt);
  const action = nextAction(state, started ? (getUseCase(started.useCase)?.id ?? null) : null);
  const [brief, plan, perf, completed, peers, conversations, actionPlans] = await Promise.all([
    company && active ? founderAssessment(company.id, active.def.id) : null,
    company && active ? progressView(company, active.def.id) : null,
    company ? companyPerformance(company) : null,
    company ? assessmentCompletions(company.id) : ({} as Partial<Record<string, Date>>),
    company ? getIntakeAnswers(company).then((a) => snapshotPeers(company, a)) : null,
    company ? listConversations(company, 3) : [],
    company ? founderPlans(company) : [],
  ]);
  const view = brief?.state === "ready" ? brief.view : null;
  // AE ramp time always has a place on the Overview (James's feedback): the figure, or what would give it.
  const ramp = perf?.metrics.get("ramp_months") ?? null;
  const headline = HEADLINE_METRICS.filter((m) => perf?.metrics.has(m)).slice(0, 4).map((m) => perf!.metrics.get(m)!);
  const firstName = user.name?.split(" ")[0];
  const stage = journeyStage(state);
  const startWith = firstUseCase();

  // Top three actions: the committed plan with its statuses, else the brief's proposed plan.
  const actions = plan
    ? plan.actions.filter((a) => a.status !== "dropped" && a.status !== "done").slice(0, 3).map((a) => ({ key: a.id, action: a.action, why: a.rationale, timing: a.timing, status: a.status, measure: a.successMetric }))
    : view
      ? view.plan.slice(0, 3).map((a) => ({ key: a.claimKey, action: a.action, why: a.rationale, timing: a.timing, status: null as string | null, measure: a.successMetric }))
      : [];
  const done = plan ? plan.actions.filter((a) => a.status === "done").length : 0;
  const live = plan ? plan.actions.filter((a) => a.status !== "dropped").length : 0;

  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl space-y-12">
      <PageHeader eyebrow={company?.name} title={firstName ? `Welcome back, ${firstName}` : "Your growth command center"} />

      {welcome !== undefined && company && (
        <div className="surface p-5 -mt-6 flex gap-4 items-start" style={{ background: "var(--green-muted)", borderColor: "transparent" }} role="status">
          <div>
            <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>You&apos;re set up, {company.name}. Ask your first question below.</div>
            <p className="text-base mt-0.5" style={{ color: "var(--muted-foreground)" }}>Conversations are free. When you&apos;re ready, turn one into a 30/60/90-day action plan, from {formatPrice(pricing().actionPlanCents)}.</p>
          </div>
        </div>
      )}

      {/* Action plans: ready ones first and loud, so an advisor's approval is the first thing they see. */}
      {actionPlans.length > 0 && (
        <section aria-label="Your action plans" className="space-y-3 -mt-4">
          {actionPlans.map((p) => {
            const ready = p.status === "delivered" || p.status === "active";
            const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
            return (
              <div key={p.id} className="surface p-5 flex gap-4 items-center flex-wrap" style={ready ? { background: "var(--green-muted)", borderColor: "var(--green)" } : undefined}>
                <div className="flex-1 min-w-[16rem]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill tone={ready ? "green" : "amber"}>{p.status === "active" ? "Supported plan · live" : ready ? "Ready" : "With your advisor"}</Pill>
                    {ready && p.approvedAt && <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Approved {day(p.approvedAt)}</span>}
                  </div>
                  <div className="text-lg font-semibold mt-1" style={{ color: "var(--foreground)" }}>
                    {ready ? "Your action plan is ready" : "Your action plan is being reviewed"}: {p.title}
                  </div>
                  <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
                    {ready
                      ? "Reviewed and approved by your Growth Goaled advisor: your 30/60/90-day milestones, risks and how to measure progress."
                      : `An advisor is reviewing it${p.submittedAt ? `; expect it by ${day(new Date(p.submittedAt.getTime() + REVIEW_HOURS * 3600 * 1000))}` : " within 24 hours"}. We'll email you when it's ready.`}
                  </p>
                </div>
                <Link href={`/chat/${p.conversationId}#your-plan`} className={`btn ${ready ? "btn-primary" : "btn-secondary"}`}>
                  {ready ? "Open your action plan" : "See where it's at"}
                </Link>
              </div>
            );
          })}
        </section>
      )}

      {/* The main entry: talk a decision through. */}
      {company && (
        <div className="space-y-4">
          <ChatStart starters={CHAT_TOPICS.map((t) => ({ id: t.id, starter: t.starter }))} start={startChatAction} />
          {conversations.length > 0 && (
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-base">
              <span style={{ color: "var(--muted-foreground)" }}>Pick up where you left off:</span>
              {conversations.map((c) => (
                <Link key={c.id} href={`/chat/${c.id}`} className="link">{c.title}</Link>
              ))}
              <Link href="/chat" className="link text-sm">All conversations →</Link>
            </div>
          )}
        </div>
      )}

      {/* The focal point: the main finding, or the one thing to do next. */}
      <section aria-label="Main finding">
        {view && active ? (
          <div className="surface p-6 sm:p-8" style={{ borderColor: "var(--green)", boxShadow: "0 0 0 1px var(--green)" }}>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="label" style={{ color: "var(--green)" }}>{active.def.question}</span>
              {view.certainty && <Pill tone={CERTAINTY[view.certainty]!.tone}>{CERTAINTY[view.certainty]!.label}</Pill>}
            </div>
            <h2 className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>{view.executiveDecision.decision}</h2>
            <p className="text-lg mt-3 max-w-3xl" style={{ color: "var(--muted-foreground)" }}>{view.diagnosis.primary.title}{view.recommendation.why ? `. ${view.recommendation.why}` : ""}</p>
            {view.plan[0] && (
              <div className="mt-6 rounded-xl px-5 py-4 flex gap-3 items-start" style={{ background: "var(--muted)" }}>
                <span className="text-sm font-bold shrink-0 mt-0.5" style={{ color: "var(--green)" }}>Do next</span>
                <span className="text-base font-medium" style={{ color: "var(--foreground)" }}>{view.plan[0].action}</span>
              </div>
            )}
            <div className="mt-6 flex items-center gap-4 flex-wrap">
              <Link href="/baseline" className="btn btn-primary">See the full answer →</Link>
              <Link href="/progress" className="btn btn-secondary">{plan ? "Track your plan" : "Review the plan"}</Link>
            </div>
          </div>
        ) : (
          <div className="surface p-6 sm:p-8">
            <div className="label mb-2" style={{ color: "var(--green)" }}>Next step</div>
            <h2 className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>{STAGE_COPY[stage]!.title}</h2>
            <p className="text-lg mt-3 max-w-2xl" style={{ color: "var(--muted-foreground)" }}>
              {stage === 0 ? `${STAGE_COPY[0]!.body} Not sure where to start? Try “${startWith.question}”.` : STAGE_COPY[stage]!.body}
            </p>
            <div className="mt-6 flex items-center gap-4 flex-wrap">
              <Link href={action.path} className="btn btn-primary btn-lg">{action.label} →</Link>
              {stage === 0 && <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Free. An action plan is from {formatPrice(pricing().actionPlanCents)}, only if you choose it.</span>}
            </div>
          </div>
        )}
      </section>

      {(headline.length > 0 || useCases.length > 0) && (
      <Section
        id="metrics"
        title="Your numbers"
        lead={headline.length ? "The figures that matter most right now, from your own data." : undefined}
        aside={headline.length ? <Link href="/performance" className="link text-sm">All metrics →</Link> : undefined}
      >
        {headline.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {headline.map((m) => <MetricCard key={m.metric} m={m} />)}
          </div>
        ) : (
          <div className="surface surface-pad text-base" style={{ color: "var(--muted-foreground)" }}>
            No figures yet. They appear here once you add them to your profile or share data, and they&apos;re calculated from your own files where possible.
          </div>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {ramp ? (
            <MetricCard m={ramp} />
          ) : (
            <div className="surface p-5 flex flex-col" aria-label="AE Ramp Time">
              <div className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>{METRICS.ramp_months.label}</div>
              <div className="text-lg font-semibold mt-1" style={{ color: "var(--foreground)" }}>Not enough data yet</div>
              <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>
                {METRICS.ramp_months.definition} Share your sales team roster with hire dates and it appears here.
              </p>
            </div>
          )}
        </div>
        {perf?.monthly && (
          <div className="surface p-5 mt-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>Monthly recurring revenue, last {perf.monthly.points.length} months</span>
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {formatMetric("arr", perf.monthly.points[0]!.mrr)} → <span className="font-semibold" style={{ color: "var(--foreground)" }}>{formatMetric("arr", perf.monthly.points.at(-1)!.mrr)}</span> · calculated from {perf.monthly.filename}
              </span>
            </div>
            <div className="mt-3"><Sparkline values={perf.monthly.points.map((p) => p.mrr)} label="Monthly recurring revenue trend" width={600} height={56} /></div>
          </div>
        )}
      </Section>
      )}

      {actions.length > 0 && (
        <Section
          id="actions"
          title="Your top priorities"
          lead={plan ? `${done} of ${live} actions done. Reassess by ${new Date(plan.revisitBy).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : "From your latest results. Commit to the plan to track it."}
          aside={<Link href="/progress" className="link text-sm">Full action plan →</Link>}
        >
          <ol className="surface divide-y" style={{ borderColor: "var(--border)" }}>
            {actions.map((a, i) => (
              <li key={a.key} className="p-5 flex gap-4 items-start" style={{ borderColor: "var(--border)" }}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: i === 0 ? "var(--green)" : "var(--muted)", color: i === 0 ? "#fff" : "var(--foreground)" }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{a.action}</div>
                  {a.why && <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>{a.why}</p>}
                  <div className="text-sm mt-1.5" style={{ color: "var(--muted-foreground)" }}>
                    {a.timing ? TIMING[a.timing] ?? a.timing : ""}
                    {a.measure ? ` · Measure: ${a.measure}` : ""}
                  </div>
                </div>
                {a.status && <Pill tone={ACTION_STATUS[a.status]!.tone}>{ACTION_STATUS[a.status]!.label}</Pill>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {peers && peers.length > 0 && <PeerComparisons peers={peers} title="Company Benchmark Performance" lead={benchmarkLead(peers)} columns={3} />}

      {useCases.length > 0 && (
      <Section id="questions" title="Your growth questions" aside={<Link href="/library" className="link text-sm">Explore other questions →</Link>}>
        {(
          <ul className="surface divide-y" style={{ borderColor: "var(--border)" }}>
            {useCases.flatMap((u) => {
              const def = getUseCase(u.useCase);
              if (!def) return [];
              const target = targetSummary(u.objective);
              const s = u.activatedAt && u.status !== "tracking" && completed[u.useCase] ? { label: "Results ready", tone: "green" as Tone } : (STATUS[u.status] ?? { label: u.status, tone: "neutral" as Tone });
              return [
                <li key={u.id} style={{ borderColor: "var(--border)" }}>
                  <Link href={u.activatedAt ? `/assessments/open?use_case=${def.id}` : `/library/${def.id}/snapshot`} className="flex items-center gap-4 p-5 hover:bg-[var(--muted)] rounded-xl">
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{def.question}</div>
                      {target && <div className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>Your target: {target}</div>}
                    </div>
                    <Pill tone={s.tone}>{s.label}</Pill>
                    <span aria-hidden style={{ color: "var(--muted-foreground)" }}>→</span>
                  </Link>
                </li>,
              ];
            })}
          </ul>
        )}
      </Section>
      )}
    </div>
  );
}
