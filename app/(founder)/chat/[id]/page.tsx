import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { Composer } from "@/components/chat/Composer";
import { AdvisorNudge } from "@/components/chat/AdvisorNudge";
import { showNudge } from "@/lib/chat/nudge";
import { HumanPresence } from "@/components/brand/HumanPresence";
import { FileProgress } from "@/components/chat/FileProgress";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { PlanOffer } from "@/components/chat/PlanOffer";
import { PlanPanel, type PlanPanelData } from "@/components/chat/PlanPanel";
import { RecommendationCardView } from "@/components/chat/RecommendationCardView";
import { db, schema } from "@/lib/db";
import { planSessionsFor, REVIEW_HOURS } from "@/lib/data/action-plans";
import { companyPerformance } from "@/lib/data/performance";
import { LIVE_MINUTES_PER_MONTH, supportMinutesThisMonth } from "@/lib/plan-tracking";
import { getConversation } from "@/lib/data/chat";
import { companyBlobPrefix } from "@/lib/data/documents";
import { founderContext } from "@/lib/data/founder-context";
import { formatPrice, pricing } from "@/lib/pricing";
import { stripeConfigured } from "@/lib/stripe";
import { attachFilesAction, buyPlanAction, feedbackAction, planTargetsAction, retryMessageAction, sendMessageAction, stepAssigneeAction, stepDetailsAction, stepStatusAction, startPlanAction, submitPlanAction, updatePlanAction } from "../actions";

// Each answer is prepared while the founder waits.
export const maxDuration = 300;

const fg = { color: "var(--foreground)" };
const muted = { color: "var(--muted-foreground)" };
const day = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const CHECKOUT: Record<string, { text: string; tone: string }> = {
  started: { text: "Payment received. Your action plan has started: keep going below.", tone: "var(--green-muted)" },
  pending: { text: "We're waiting for Stripe to confirm your payment. This page updates once it does.", tone: "var(--blue-muted)" },
  failed: { text: "The payment didn't go through, so nothing was charged. You can try again below.", tone: "var(--amber-muted)" },
  cancelled: { text: "Checkout cancelled. Nothing was charged.", tone: "var(--muted)" },
};

/** One conversation: the founder's messages, each answer, advisor messages, the decision cards, and the action plan built from it. */
export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ checkout?: string; billing_error?: string }> }) {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const [{ id: raw }, { checkout, billing_error: billingError }] = await Promise.all([params, searchParams]);
  const id = z.uuid().safeParse(raw);
  if (!id.success) notFound();
  const view = await getConversation(company, id.data);
  if (!view) notFound();
  const last = view.messages.at(-1);
  const plan = view.plan && view.plan.status !== "pending_payment" ? view.plan : null;
  const lastCardId = [...view.messages].reverse().find((m) => m.recommendationId)?.recommendationId ?? null;
  // The latest recommendation always sits below the reply box, so the box stays right under the
  // conversation (questions, answers, shared files) and above the card, whatever came after it.
  const trailing = lastCardId ? view.recommendations.get(lastCardId) : undefined;
  // Files still being read: keep the page refreshing until they're done.
  const reading = view.messages.some((m) => (m.documentIds ?? []).some((d) => ["uploaded", "analyzing"].includes(view.documents.get(d)?.status ?? "")));
  const offer = !plan && stripeConfigured();
  const { actionPlanCents, supportedMonthlyCents } = pricing();
  const [advisor] = company.advisorId ? await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, company.advisorId)).limit(1) : [];

  // For a bought plan: the company's latest figures (targets) and, on Execute & Monitor, the live CRO time logged.
  const [perf, sessions] = plan ? await Promise.all([companyPerformance(company), plan.tier === "supported" ? planSessionsFor(plan.id) : Promise.resolve([])]) : [null, []];
  const now = new Date();
  const lastReview = sessions.find((x) => x.kind === "review");
  const panel: PlanPanelData | null = plan
    ? {
        id: plan.id,
        tier: plan.tier,
        status: plan.status as PlanPanelData["status"],
        needs: plan.needs,
        content: plan.content,
        drafting: Boolean(plan.draftingStartedAt),
        expectedBy: plan.submittedAt ? day(new Date(plan.submittedAt.getTime() + REVIEW_HOURS * 3600 * 1000)) : null,
        approvedOn: plan.approvedAt ? day(plan.approvedAt) : null,
        reviewNote: plan.reviewNote,
        advisorName: advisor ? advisor.name || advisor.email : null,
        billingHref: plan.tier === "supported" && plan.stripeSubscriptionId ? `/billing?return=${encodeURIComponent(`/chat/${view.conversation.id}`)}` : null,
        today: now.toISOString().slice(0, 10),
        current: Object.fromEntries([...(perf?.metrics.values() ?? [])].map((m) => [m.metric, m.value])),
        live:
          plan.tier === "supported" && plan.status === "active"
            ? {
                usedMinutes: supportMinutesThisMonth(sessions, now),
                allowanceMinutes: LIVE_MINUTES_PER_MONTH,
                lastReview: lastReview ? day(new Date(`${lastReview.heldOn}T00:00:00Z`)) : null,
                reviewHref: "/advisory/book?kind=monthly&offer=review",
                supportHref: "/advisory/book?kind=review&offer=live",
              }
            : null,
      }
    : null;

  return (
    <div className={`px-4 sm:px-8 py-8 ${lastCardId ? "max-w-5xl" : "max-w-3xl"}`}>
    <div className="space-y-6 min-w-0">
      <div>
        <Link href="/chat" className="link text-sm">← All Strategic Growth Questions</Link>
        <h1 className="font-display text-3xl font-normal mt-2" style={fg}>{view.conversation.title}</h1>
        <div className="mt-3">
          <HumanPresence advisorName={advisor ? advisor.name || advisor.email : null} />
        </div>
      </div>

      {checkout && CHECKOUT[checkout] && (
        <p role="status" className="rounded-lg px-4 py-3 text-base" style={{ background: CHECKOUT[checkout]!.tone, color: "var(--foreground)" }}>
          {CHECKOUT[checkout]!.text}
        </p>
      )}

      {billingError && (
        <p role="alert" className="rounded-lg px-4 py-3 text-base" style={{ background: "var(--red-muted, var(--muted))", color: "var(--foreground)" }}>
          {billingError.slice(0, 200)}
        </p>
      )}

      {panel && <PlanPanel plan={panel} submit={submitPlanAction} update={updatePlanAction} move={stepStatusAction} assign={stepAssigneeAction} startPlan={startPlanAction} editStep={stepDetailsAction} saveTargets={planTargetsAction} />}

      <BuildingRefresh active={reading} />
      <ol className="space-y-5" aria-label="Conversation">
        {view.messages.map((m) => {
          const rec = m.recommendationId ? view.recommendations.get(m.recommendationId) : undefined;
          if (m.role === "user") {
            const files = (m.documentIds ?? []).map((d) => view.documents.get(d)).filter(Boolean);
            return (
              <li key={m.id} className="flex justify-end">
                <div className="rounded-2xl px-4 py-3 text-base max-w-[85%] whitespace-pre-wrap" style={{ background: "var(--navy)", color: "#fff" }}>
                  {m.content}
                  {files.map((f) =>
                    f!.status === "uploaded" || f!.status === "analyzing" ? (
                      <FileProgress key={f!.id} filename={f!.filename} since={m.createdAt.toISOString()} />
                    ) : (
                      <span key={f!.id} className="block text-sm mt-1 opacity-80">{f!.status === "failed" ? `${f!.filename} couldn't be read` : `✓ ${f!.filename} read`}</span>
                    ),
                  )}
                </div>
              </li>
            );
          }
          if (m.role === "advisor") {
            return (
              <li key={m.id} className="rounded-2xl px-4 py-3" style={{ background: "var(--green-muted)" }}>
                <div className="text-sm font-semibold mb-1" style={{ color: "var(--green)" }}>Your advisor{m.authorId && view.authors.get(m.authorId) ? ` · ${view.authors.get(m.authorId)}` : ""}</div>
                <div className="text-base whitespace-pre-wrap" style={fg}>{m.content}</div>
              </li>
            );
          }
          return (
            <li key={m.id} className="space-y-4">
              <div className="text-base whitespace-pre-wrap leading-relaxed" style={fg}>{m.content}</div>
              {rec && rec !== trailing && (
                <RecommendationCardView
                  id={rec.id}
                  card={rec.card}
                  given={(view.feedback.get(rec.id) ?? []).map((f) => f.kind)}
                  deeper={null}
                  feedback={feedbackAction}
                  compact
                />
              )}
              {rec && rec !== trailing && offer && rec.id === lastCardId && (
                <PlanOffer conversationId={view.conversation.id} planPrice={formatPrice(actionPlanCents)} supportedPrice={formatPrice(supportedMonthlyCents)} buy={buyPlanAction} bookHref="/advisory/book?kind=review" />
              )}
            </li>
          );
        })}
      </ol>

      <Composer
        conversationId={view.conversation.id}
        send={sendMessageAction}
        retry={retryMessageAction}
        awaitingAnswer={last?.role === "user" && !last.documentIds?.length}
        attach={attachFilesAction}
        blobPrefix={companyBlobPrefix(company.id)}
      />
      {showNudge(view.messages.filter((m) => m.role === "user").length, Boolean(plan)) && <AdvisorNudge bookHref="/advisory/book?kind=review&offer=nudge" />}
      {trailing && (
        <div className="space-y-4">
          <RecommendationCardView id={trailing.id} card={trailing.card} given={(view.feedback.get(trailing.id) ?? []).map((f) => f.kind)} deeper={null} feedback={feedbackAction} compact />
          {offer && trailing.id === lastCardId && (
            <PlanOffer conversationId={view.conversation.id} planPrice={formatPrice(actionPlanCents)} supportedPrice={formatPrice(supportedMonthlyCents)} buy={buyPlanAction} bookHref="/advisory/book?kind=review" />
          )}
        </div>
      )}
      <p className="text-sm" style={muted}>
        Facts you mention are remembered for your company, so you won&apos;t be asked twice. <Link href="/chat#facts" className="link">See or correct them</Link>. Never shown to other
        companies; <Link href="/data-use" className="link">how we use your data</Link>.
      </p>
    </div>
    </div>
  );
}
