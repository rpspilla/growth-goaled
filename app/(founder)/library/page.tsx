import Link from "next/link";
import { Faq } from "@/components/Faq";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/ui/Section";
import { GrowthOptions } from "@/components/use-cases/GrowthOptions";
import { ProjectHistory } from "@/components/use-cases/ProjectHistory";
import { founderPlans } from "@/lib/data/action-plans";
import { assessmentCompletions } from "@/lib/data/assessments";
import { currentPlan } from "@/lib/data/current-plan";
import { founderContext } from "@/lib/data/founder-context";
import { listPayments } from "@/lib/data/payments";
import { track } from "@/lib/events";
import { isUseCaseId } from "@/lib/use-cases";
import { assessmentHistory } from "@/lib/use-cases/history";

const STATUS: Record<string, string> = { drafting: "Being written", in_review: "With your advisor for review", delivered: "Ready", active: "Live with your advisor" };

/**
 * Growth Projects: start one (two ways to work a problem, your current plan, or a custom project),
 * your action plans, and every growth project so far. Data, Results and Action plan of an active
 * project sit under it in the menu.
 */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [{ user, company, useCases }, { welcome }] = await Promise.all([founderContext(), searchParams]);
  if (company) await track("library_viewed", { userId: user.id, companyId: company.id });
  const [plan, plans, history] = company
    ? await Promise.all([currentPlan(company), founderPlans(company), Promise.all([listPayments(company.id), assessmentCompletions(company.id)]).then(([payments, completed]) => assessmentHistory(useCases, payments, completed, [], isUseCaseId))])
    : [null, [], []];

  return (
    <div className="page space-y-12">
      {welcome !== undefined && (
        <div className="surface p-5" style={{ background: "var(--green-muted)", borderColor: "transparent" }} role="status">
          <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>You&apos;re set up{company ? `, ${company.name}` : ""}. Pick where you&apos;d like to start.</div>
        </div>
      )}
      <div>
        <PageHeader title="Growth Projects" subtitle="Pick where you'd like to start. A Growth Goaled advisor works through it with you." />
        <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--foreground)" }}>What do you need to decide?</h2>
        <GrowthOptions plan={plan} />
      </div>

      {plans.length > 0 && (
        <Section id="action-plans" title="Your action plans" lead="Every plan you've built with your advisor.">
          <ul aria-label="Your action plans" className="surface divide-y" style={{ borderColor: "var(--border)" }}>
            {plans.map((p) => (
              <li key={p.id} style={{ borderColor: "var(--border)" }}>
                <Link href={`/chat/${p.conversationId}#your-plan`} className="flex items-center gap-4 p-4 hover:bg-[var(--muted)] rounded-xl">
                  <span className="flex-1 min-w-0 text-base font-semibold" style={{ color: "var(--foreground)" }}>{p.title}</span>
                  <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{STATUS[p.status] ?? p.status}</span>
                  <span aria-hidden style={{ color: "var(--muted-foreground)" }}>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {history.length > 0 && (
        <Section id="past-projects" title="Your growth projects" lead="Every growth project you've started or bought, and where each one stands.">
          <ProjectHistory entries={history} />
        </Section>
      )}

      <Faq className="max-w-3xl" />
    </div>
  );
}
