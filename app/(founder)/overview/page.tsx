import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { Pill } from "@/components/ui/Pill";
import { Section } from "@/components/ui/Section";
import { CompanyLogo } from "@/components/brand/CompanyLogo";
import { MrrChart } from "@/components/performance/MrrChart";
import { ProjectDocuments } from "@/components/projects/ProjectDocuments";
import { ReviewActionPlan } from "@/components/projects/ReviewActionPlan";
import { PeerComparisons } from "@/components/use-cases/PeerComparisons";
import { companySite } from "@/lib/data/company-site";
import { founderContext } from "@/lib/data/founder-context";
import { getIntakeAnswers } from "@/lib/data/intake";
import { snapshotPeers } from "@/lib/data/peers";
import { companyPerformance } from "@/lib/data/performance";
import { companyProjects, currentPriorities } from "@/lib/data/projects";
import type { PeerComparison } from "@/lib/benchmark-library/peers";
import { METRICS, type MetricKey } from "@/lib/metrics";
import { projectDay } from "@/lib/project-links";
import { weekLabel } from "@/lib/weeks";
import { AskBox } from "@/components/chat/AskBox";
import { CommitmentList } from "@/components/projects/CommitmentList";
import { CHAT_TOPICS } from "@/lib/chat/topics";
import { commitmentItems } from "@/lib/commitments";
import { listConversations } from "@/lib/data/chat";
import { companyCommitments } from "@/lib/data/commitments";
import { listCroProfiles } from "@/lib/data/cro";
import { today } from "@/lib/data/projects";
import { commitmentStatusAction, rescheduleCommitmentAction, startChatAction } from "../chat/actions";
import { checkinCount, checkinItems } from "@/lib/data/checkins";

/** The four numbers the Overview leads with (Founder View redesign): nothing else here. */
const OVERVIEW_METRICS: MetricKey[] = ["arr", "nrr", "sales_cycle_days", "mom_growth"];
const due = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

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

/**
 * The founder's home. It opens with their AI CRO ("What are you working through?", AI CRO sprint,
 * Nov 23, 2026), the conversations to pick up and the commitments they've made; then the advisor's
 * plans with their documents, the four numbers that matter, six months of MRR, this week's
 * priorities from the advisor, and benchmarks.
 */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { user, company } = await founderContext();
  if (!company) redirect("/welcome");
  const [perf, peers, site, projects, priorities, conversations, commitments, cros] = await Promise.all([
    companyPerformance(company),
    getIntakeAnswers(company).then((a) => snapshotPeers(company, a)),
    companySite(company),
    companyProjects(company),
    currentPriorities(company),
    listConversations(company, 3),
    companyCommitments(company, { status: ["open"] }),
    listCroProfiles({ published: true }),
  ]);
  const toCheckIn = checkinCount(await checkinItems(company));
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const firstName = user.name?.split(" ")[0];
  // The open projects lead (the Growth Hiring Plan for most companies); else the latest completed one.
  const open = projects.filter((p) => p.status === "open");
  const shown = open.length ? open : projects.slice(0, 1);

  return (
    <div className="page space-y-12">
      {company ? (
        <header className="flex gap-5 items-start flex-wrap">
          <CompanyLogo name={company.name} src={site?.logoUrl ?? null} size={72} />
          <div className="flex-1 min-w-[16rem]">
            <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</div>
            <h1 className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>{company.name}</h1>
            {site?.about ? (
              <p aria-label="What the company does" className="text-lg mt-1 max-w-3xl" style={{ color: "var(--muted-foreground)" }}>{site.about}</p>
            ) : (
              <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>
                {site?.website ? "We couldn't read a description from your website." : "Add your website to your company profile to show your logo and what you do."}{" "}
                <Link href="/profile" className="link">Company profile</Link>
              </p>
            )}
            {site?.website && <a href={`https://${site.website}`} target="_blank" rel="noopener" className="link text-sm">{site.website}</a>}
          </div>
        </header>
      ) : (
        <PageHeader title={firstName ? `Welcome back, ${firstName}` : "Your growth command center"} />
      )}

      {welcome !== undefined && company && (
        <div className="surface p-5 -mt-6" style={{ background: "var(--green-muted)", borderColor: "transparent" }} role="status">
          <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>You&apos;re set up, {company.name}.</div>
          <p className="text-base mt-0.5" style={{ color: "var(--muted-foreground)" }}>Your plan with your advisor, your numbers and how you compare all live here.</p>
        </div>
      )}


      <AskBox starters={CHAT_TOPICS.map((t) => ({ id: t.id, starter: t.starter }))} start={startChatAction} cros={cros.map((c) => ({ id: c.id, name: c.name }))} />

      {conversations.length > 0 && (
        <Section id="conversations" title="Pick up where you left off" aside={<Link href="/whats-next" className="link text-sm">All conversations →</Link>}>
          <ul aria-label="Recent conversations" className="surface divide-y" style={{ borderColor: "var(--border)" }}>
            {conversations.map((c) => (
              <li key={c.id} style={{ borderColor: "var(--border)" }}>
                <Link href={`/chat/${c.id}`} className="flex items-center gap-4 p-4 hover:bg-[var(--muted)] rounded-xl">
                  <span className="flex-1 min-w-0 text-base font-semibold truncate" style={{ color: "var(--foreground)" }}>{c.title}</span>
                  <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{c.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <span aria-hidden style={{ color: "var(--muted-foreground)" }}>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {commitments.length > 0 && (
        <Section
          id="commitments"
          title="Your commitments"
          lead="What you committed to with your CRO. Tick them off as you go; your CRO asks about the ones that slip."
          aside={toCheckIn ? <Link href="/checkin" className="btn btn-primary text-sm">Weekly check-in ({toCheckIn})</Link> : undefined}
        >
          <CommitmentList items={commitmentItems(commitments, projectNames, today())} label="Your commitments" actions={{ setStatus: commitmentStatusAction, reschedule: rescheduleCommitmentAction }} />
        </Section>
      )}

      <Section id="plans" title="Your plans" lead="Plans and documents from your Growth Goaled advisor." aside={projects.length ? <Link href="/projects" className="link text-sm">All growth projects →</Link> : undefined}>
        {shown.length ? (
          <div className="space-y-6">
            {shown.map((p) => (
              <article key={p.id} aria-label={p.name} className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
                    <Link href={`/projects/${p.id}`} className="hover:underline">{p.name}</Link>
                  </h3>
                  <Pill tone={p.status === "completed" ? "neutral" : "green"}>{p.status === "completed" ? "Completed" : "Open"}</Pill>
                  <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Started {projectDay(p.startedOn)}</span>
                </div>
                <ReviewActionPlan plan={p.actionPlan} project={p.name} />
                <ProjectDocuments documents={p.documents} project={p.name} />
              </article>
            ))}
          </div>
        ) : (
          <div className="surface p-6 text-base" style={{ color: "var(--muted-foreground)" }}>Your advisor will share your plan here.</div>
        )}
      </Section>

      <Section id="metrics" title="Business metrics" aside={<Link href="/performance" className="link text-sm">Company performance →</Link>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {OVERVIEW_METRICS.map((k) => {
            const m = perf.metrics.get(k);
            return m ? (
              <MetricCard key={k} m={m} />
            ) : (
              <div key={k} className="surface p-5" aria-label={METRICS[k].label}>
                <div className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>{METRICS[k].label}</div>
                <div className="text-lg font-semibold mt-1" style={{ color: "var(--muted-foreground)" }}>Not available yet</div>
              </div>
            );
          })}
        </div>
        {perf.monthly && perf.monthly.points.length >= 2 && (
          <div className="mt-4">
            <MrrChart points={perf.monthly.points} source={perf.monthly.filename} />
          </div>
        )}
      </Section>

      <Section
        id="priorities"
        title="Top priorities"
        lead={priorities ? (priorities.current ? `This week: ${weekLabel(priorities.weekStart)}` : `From the week of ${weekLabel(priorities.weekStart)}. This week's are on their way.`) : undefined}
      >
        {priorities?.items.length ? (
          <ol aria-label="Top priorities" className="surface divide-y" style={{ borderColor: "var(--border)" }}>
            {priorities.items.map((p, i) => (
              <li key={p.id} className="p-5 flex gap-4 items-start" style={{ borderColor: "var(--border)" }}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: i === 0 ? "var(--green)" : "var(--muted)", color: i === 0 ? "#fff" : "var(--foreground)" }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{p.title}</div>
                  <p className="text-base mt-0.5" style={{ color: "var(--foreground)" }}>
                    <span className="font-semibold" style={{ color: "var(--green)" }}>Next 7 days: </span>
                    {p.action}
                  </p>
                </div>
                {p.dueOn && (
                  <span className="text-sm inline-flex items-center gap-1 shrink-0" style={{ color: "var(--muted-foreground)" }}>
                    <CalendarCheck size={14} aria-hidden /> by {due(p.dueOn)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <div className="surface p-5 text-base" style={{ color: "var(--muted-foreground)" }}>Your advisor sets your priorities each week. They&apos;ll appear here.</div>
        )}
      </Section>

      {peers && peers.length > 0 && <PeerComparisons peers={peers} title="Company Benchmark Performance" lead={benchmarkLead(peers)} columns={3} />}
    </div>
  );
}
