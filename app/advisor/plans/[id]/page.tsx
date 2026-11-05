import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ActionPlanView } from "@/components/chat/ActionPlanView";
import { AdvisorReply, PlanEditor, RedraftButton } from "@/components/chat/PlanEditor";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { Pill } from "@/components/ui/Pill";
import { canViewCompany } from "@/lib/access";
import { requireRole } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { REVIEW_HOURS } from "@/lib/data/action-plans";
import { formatPrice, pricing } from "@/lib/pricing";
import { getConversation } from "@/lib/data/chat";
import { advisorMessageAction, advisorStepAction, approvePlanAction, redraftPlanAction, resendPlanEmailAction } from "../actions";
import { ResendPlanEmail } from "@/components/chat/ResendPlanEmail";

export const maxDuration = 300;

const fg = { color: "var(--foreground)" };
const muted = { color: "var(--muted-foreground)" };
const STATUS: Record<string, string> = { collecting: "Founder still adding information", drafting: "Drafting", in_review: "Waiting for your approval", delivered: "Delivered", active: "Supported · active", cancelled: "Support ended", pending_payment: "Not paid" };

/** One action plan for staff: the founder's conversation, and the plan to approve ($499) or support ($799/month). */
export default async function AdvisorPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["advisor", "admin"]);
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [row] = await db
    .select({ plan: schema.actionPlans, company: schema.companies })
    .from(schema.actionPlans)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.actionPlans.companyId))
    .where(eq(schema.actionPlans.id, id.data))
    .limit(1);
  if (!row || !canViewCompany(user, row.company, [])) notFound();
  const { plan, company } = row;
  const view = (await getConversation(company, plan.conversationId))!;
  const due = plan.submittedAt ? new Date(plan.submittedAt.getTime() + REVIEW_HOURS * 3600 * 1000) : null;

  return (
    <div className="px-4 sm:px-8 py-8 w-full space-y-6">
      <BuildingRefresh active={plan.status === "drafting" || Boolean(plan.draftingStartedAt)} />
      <div>
        <Link href="/advisor/plans" className="link text-sm">← Action plans</Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <h1 className="font-display text-3xl font-normal" style={fg}>{company.name}: {view.conversation.title}</h1>
          <Pill tone={plan.status === "in_review" ? "amber" : plan.status === "active" || plan.status === "delivered" ? "green" : "neutral"}>{STATUS[plan.status]}</Pill>
          <Pill tone="blue">{plan.tier === "supported" ? `Execute & Monitor · ${formatPrice(pricing().supportedMonthlyCents)}/month` : `Diagnose · ${formatPrice(pricing().actionPlanCents)}`}</Pill>
        </div>
        {due && plan.status === "in_review" && <p className="text-base mt-1" style={muted}>Due {due.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
      </div>

      {/* The whole screen: the conversation as a narrow, pinned column; the plan gets the rest. */}
      <div className="grid lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] 2xl:grid-cols-[28rem_minmax(0,1fr)] gap-6 items-start">
        <section aria-label="Conversation" className="surface p-4 space-y-3 max-h-[75vh] lg:max-h-[calc(100vh-7rem)] lg:sticky lg:top-6 overflow-y-auto">
          <h2 className="label">Conversation</h2>
          {view.messages.map((m) => (
            <div key={m.id} className="text-sm">
              <div className="font-semibold" style={{ color: m.role === "advisor" ? "var(--green)" : m.role === "user" ? "var(--navy)" : "var(--muted-foreground)" }}>
                {m.role === "user" ? "Founder" : m.role === "advisor" ? `Advisor${m.authorId && view.authors.get(m.authorId) ? ` · ${view.authors.get(m.authorId)}` : ""}` : "Growth Goaled"}
              </div>
              <div className="whitespace-pre-wrap" style={fg}>{m.content}</div>
            </div>
          ))}
          {plan.status === "collecting" && plan.needs.length > 0 && <p className="text-sm" style={muted}>Still being gathered: {plan.needs.join("; ")}</p>}
        </section>

        <section aria-label="Plan" className="space-y-4">
          {plan.tier === "plan" && (plan.status === "in_review" || plan.status === "drafting") && (
            <div className="surface p-5">
              {plan.status === "drafting" ? <p className="text-base" style={muted}>Writing the draft from the conversation… this page updates when it&apos;s ready.</p> : <PlanEditor planId={plan.id} initial={plan.content} approve={approvePlanAction} redraft={redraftPlanAction} />}
            </div>
          )}
          {plan.content && (plan.status === "delivered" || plan.tier === "supported") && (
            <div className="surface p-5 space-y-4">
              {plan.status === "delivered" && <p className="text-sm" style={muted}>Approved {plan.approvedAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}{plan.reviewNote ? ` · Note: ${plan.reviewNote}` : ""}</p>}
              {plan.status === "delivered" && <ResendPlanEmail planId={plan.id} resend={resendPlanEmailAction} />}
              <ActionPlanView content={plan.content} toggle={plan.status === "active" ? advisorStepAction.bind(null, plan.id) : undefined} />
            </div>
          )}
          {plan.tier === "supported" && plan.status === "active" && (
            <div className="surface p-5 space-y-4">
              <AdvisorReply planId={plan.id} send={advisorMessageAction} />
              <RedraftButton planId={plan.id} redraft={redraftPlanAction} label="Update the plan from the conversation" />
            </div>
          )}
          {plan.status === "collecting" && <p className="surface surface-pad text-base" style={muted}>The founder hasn&apos;t submitted this plan yet.</p>}
        </section>
      </div>
    </div>
  );
}
