import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { AskBox } from "@/components/chat/AskBox";
import { CommitmentList } from "@/components/projects/CommitmentList";
import { Section } from "@/components/ui/Section";
import { CHAT_TOPICS } from "@/lib/chat/topics";
import { commitmentItems } from "@/lib/commitments";
import { checkinCount, checkinItems, checkinMessage } from "@/lib/data/checkins";
import { companyCommitments } from "@/lib/data/commitments";
import { founderContext } from "@/lib/data/founder-context";
import { companyProjects, today } from "@/lib/data/projects";
import { addDays } from "@/lib/weeks";
import { commitmentOutcomeAction, commitmentStatusAction, rescheduleCommitmentAction, startChatAction } from "../chat/actions";

export const metadata = { title: "Weekly check-in" };
export const maxDuration = 300;

/**
 * The weekly check-in (Nov 24, 2026; linked from Monday's email and the Overview): what slipped, what's
 * due this week and what's done without saying how it went. Tick, move, drop, record outcomes, then
 * talk the week through with the CRO, starting from a summary of where things stand.
 */
export default async function CheckinPage() {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const on = today();
  const [items, projects, all] = await Promise.all([checkinItems(company, on), companyProjects(company), companyCommitments(company)]);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const actions = { setStatus: commitmentStatusAction, setOutcome: commitmentOutcomeAction, reschedule: rescheduleCommitmentAction };
  // Closed in the last 7 days: what the check-in reports back to the CRO.
  const weekAgo = Date.parse(`${addDays(on, -7)}T00:00:00Z`);
  const recent = all.filter((c) => c.status !== "open" && (c.closedAt?.getTime() ?? 0) >= weekAgo);
  const groups = [
    { id: "overdue", title: "Slipped", lead: "Past their due date. Done, a new date, or drop it.", rows: items.overdue },
    { id: "due", title: "Due this week", lead: undefined, rows: items.dueThisWeek },
    { id: "outcomes", title: "Done: how did it go?", lead: "Your CRO learns from what worked and what didn't.", rows: items.needsOutcome },
  ].filter((g) => g.rows.length);

  return (
    <div className="page space-y-10">
      <PageHeader title="Weekly check-in" subtitle={`${company.name}: two minutes on your commitments, then the week ahead with your CRO.`} />

      {checkinCount(items) === 0 && (
        <p className="surface p-5 text-base" style={{ color: "var(--muted-foreground)" }}>
          Nothing slipped, nothing due this week, and every finished commitment has its outcome. <Link href="/overview" className="link">Back to your Overview</Link>
        </p>
      )}

      {groups.map((g) => (
        <Section key={g.id} id={g.id} title={g.title} lead={g.lead}>
          <CommitmentList items={commitmentItems(g.rows, names, on)} label={g.title} actions={actions} />
        </Section>
      ))}

      <AskBox
        title="Talk the week through with your CRO"
        lead="We've written where things stand. Add anything else, then ask."
        starters={CHAT_TOPICS.map((t) => ({ id: t.id, starter: t.starter }))}
        start={startChatAction}
        initialText={checkinMessage(items, recent)}
      />
    </div>
  );
}
