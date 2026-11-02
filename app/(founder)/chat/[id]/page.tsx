import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { Composer } from "@/components/chat/Composer";
import { PlanOffer } from "@/components/chat/PlanOffer";
import { PlanPanel, type PlanPanelData } from "@/components/chat/PlanPanel";
import { RecommendationCardView } from "@/components/chat/RecommendationCardView";
import { db, schema } from "@/lib/db";
import { REVIEW_HOURS } from "@/lib/data/action-plans";
import { getConversation } from "@/lib/data/chat";
import { companyBlobPrefix } from "@/lib/data/documents";
import { founderContext } from "@/lib/data/founder-context";
import { formatPrice, pricing } from "@/lib/pricing";
import { stripeConfigured } from "@/lib/stripe";
import { attachFilesAction, buyPlanAction, feedbackAction, retryMessageAction, sendMessageAction, stepDoneAction, submitPlanAction, updatePlanAction } from "../actions";

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
export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const [{ id: raw }, { checkout }] = await Promise.all([params, searchParams]);
  const id = z.uuid().safeParse(raw);
  if (!id.success) notFound();
  const view = await getConversation(company, id.data);
  if (!view) notFound();
  const last = view.messages.at(-1);
  const plan = view.plan && view.plan.status !== "pending_payment" ? view.plan : null;
  const lastCardId = [...view.messages].reverse().find((m) => m.recommendationId)?.recommendationId ?? null;
  const offer = !plan && stripeConfigured();
  const { actionPlanCents, supportedMonthlyCents } = pricing();
  const [advisor] = company.advisorId ? await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, company.advisorId)).limit(1) : [];

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
      }
    : null;

  return (
    <div className="px-4 sm:px-8 py-8 max-w-3xl space-y-6">
      <div>
        <Link href="/chat" className="link text-sm">← All conversations</Link>
        <h1 className="font-display text-3xl font-normal mt-2" style={fg}>{view.conversation.title}</h1>
      </div>

      {checkout && CHECKOUT[checkout] && (
        <p role="status" className="rounded-lg px-4 py-3 text-base" style={{ background: CHECKOUT[checkout]!.tone, color: "var(--foreground)" }}>
          {CHECKOUT[checkout]!.text}
        </p>
      )}

      {panel && <PlanPanel plan={panel} submit={submitPlanAction} update={updatePlanAction} toggle={stepDoneAction} />}

      <ol className="space-y-5" aria-label="Conversation">
        {view.messages.map((m) => {
          const rec = m.recommendationId ? view.recommendations.get(m.recommendationId) : undefined;
          if (m.role === "user") {
            const files = (m.documentIds ?? []).map((d) => view.documents.get(d)).filter(Boolean);
            return (
              <li key={m.id} className="flex justify-end">
                <div className="rounded-2xl px-4 py-3 text-base max-w-[85%] whitespace-pre-wrap" style={{ background: "var(--navy)", color: "#fff" }}>
                  {m.content}
                  {files.length > 0 && <span className="block text-sm mt-1 opacity-80">{files.map((f) => (f!.status === "done" ? `✓ ${f!.filename} read` : f!.status === "failed" ? `${f!.filename} couldn't be read` : `Reading ${f!.filename}…`)).join(" · ")}</span>}
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
              {rec && (
                <RecommendationCardView
                  id={rec.id}
                  card={rec.card}
                  given={(view.feedback.get(rec.id) ?? []).map((f) => f.kind)}
                  deeper={null}
                  feedback={feedbackAction}
                />
              )}
              {rec && offer && rec.id === lastCardId && (
                <PlanOffer conversationId={view.conversation.id} planPrice={formatPrice(actionPlanCents)} supportedPrice={formatPrice(supportedMonthlyCents)} buy={buyPlanAction} />
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
      <p className="text-sm" style={muted}>
        Facts you mention are remembered for your company, so you won&apos;t be asked twice. <Link href="/chat#facts" className="link">See or correct them</Link>. Never shown to other
        companies; <Link href="/data-use" className="link">how we use your data</Link>.
      </p>
    </div>
  );
}
