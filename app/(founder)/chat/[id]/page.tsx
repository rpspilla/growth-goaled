import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { Composer } from "@/components/chat/Composer";
import { AdvisorNudge } from "@/components/chat/AdvisorNudge";
import { showNudge } from "@/lib/chat/nudge";
import { FileProgress } from "@/components/chat/FileProgress";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { PlanOffer } from "@/components/chat/PlanOffer";
import { CroIdentity, toCroCard } from "@/components/chat/CroIdentity";
import { RichReply } from "@/components/chat/RichReply";
import { ListenButton } from "@/components/chat/Speaker";
import { voiceConfigured } from "@/lib/ai/voice";
import { AnswerFeedback, FullReasoning } from "@/components/chat/AnswerFeedback";
import { isBeta } from "@/lib/beta";
import { PlanPanel, type PlanPanelData } from "@/components/chat/PlanPanel";
import { RecommendationCardView } from "@/components/chat/RecommendationCardView";
import { CommitToThis } from "@/components/chat/CommitToThis";
import { projectNameFrom, proposeCommitments } from "@/lib/commitments";
import { committedProjects } from "@/lib/data/commitments";
import { attributionFor, getCroProfile, listCroProfiles, strongestCros } from "@/lib/data/cro";
import { PerspectiveSwitch, SecondOpinion } from "@/components/chat/Perspective";
import { companyProjects, today } from "@/lib/data/projects";
import { db, schema } from "@/lib/db";
import { planSessionsFor, REVIEW_HOURS } from "@/lib/data/action-plans";
import { companyPerformance } from "@/lib/data/performance";
import { LIVE_MINUTES_PER_MONTH, supportMinutesThisMonth } from "@/lib/plan-tracking";
import { getConversation } from "@/lib/data/chat";
import { companyBlobPrefix } from "@/lib/data/documents";
import { founderContext } from "@/lib/data/founder-context";
import { formatPrice, pricing } from "@/lib/pricing";
import { stripeConfigured } from "@/lib/stripe";
import { commitRecommendationAction, rateAnswerAction, secondOpinionAction, switchPerspectiveAction, attachFilesAction, buyPlanAction, feedbackAction, planTargetsAction, retryMessageAction, sendMessageAction, answerStepAction, answerStepFileAction, stepDetailsAction, stepStatusAction, startPlanAction, submitPlanAction, updatePlanAction } from "../actions";

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
  const { user, company } = await founderContext();
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
  // No plan offers during the Rally Beta (lib/beta).
  const offer = !plan && stripeConfigured() && !isBeta();
  const { actionPlanCents, supportedMonthlyCents } = pricing();
  const [advisor] = company.advisorId ? await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, company.advisorId)).limit(1) : [];

  // Who the founder is talking to, and what each card drew on (attribution is never lost).
  const [cro, network, strongest] = await Promise.all([
    view.conversation.croId ? getCroProfile(view.conversation.croId) : Promise.resolve(null),
    listCroProfiles({ published: true }),
    strongestCros(company, { text: view.conversation.title, topicId: view.conversation.topic }),
  ]);
  const sources = await attributionFor([...view.recommendations.values()].flatMap((r) => (r.card.sources ?? []).map((x) => x.id)));
  const informedBy = (card: { sources?: { id: string; how: string }[] }) =>
    (card.sources ?? []).flatMap((x) => {
      const a = sources.get(x.id);
      return a ? [{ title: a.title, cro: a.cro ?? "Growth Goaled network", how: x.how }] : [];
    });
  const asCro = (c: { id: string; name: string; slug: string }) => ({ id: c.id, name: c.name, slug: c.slug });
  const current = cro && cro.status === "published" ? cro : null;
  // Label each answer with its perspective once more than one has answered (a switch, or a second opinion).
  const perspectives = new Set(view.messages.filter((m) => m.role === "assistant").map((m) => m.croId ?? "collective"));
  const labelAnswers = perspectives.size > 1;
  const perspectiveOf = (m: { croId: string | null; secondOpinion: boolean }) =>
    m.secondOpinion ? "Second opinion from the Growth Goaled Collective" : m.croId ? `${view.cros.get(m.croId) ?? "A CRO"}'s AI CRO` : "Growth Goaled Collective";
  const trailingMessage = lastCardId ? view.messages.find((m) => m.recommendationId === lastCardId) : undefined;
  // Spoken answers: in the voice of the CRO who gave it, when they've set one up (lib/data/voice).
  // Answers without their own CRO's voice speak in Rally's (a CRO's, by their choice), if there is one.
  const voiced = new Map(network.filter((c) => c.voiceId && c.voiceConsentAt).map((c) => [c.id, c.name]));
  const rally = network.find((c) => c.rallyVoice && c.voiceId && c.voiceConsentAt) ?? null;
  const spoken = (m: { id: string; content: string; croId: string | null }) => {
    const own = m.croId ? voiced.get(m.croId) : undefined;
    return { id: m.id, text: m.content, voiced: Boolean(own || rally), who: own ?? rally?.name ?? null };
  };
  const lastAnswer = [...view.messages].reverse().find((m) => m.role === "assistant");

  // "Commit to this" on the latest card: its next steps as commitments, into a new or an open growth project.
  const [committed, openProjects] = trailing ? await Promise.all([committedProjects(company, [trailing.id]), companyProjects(company)]) : [new Map(), []];
  const commit = trailing
    ? {
        proposals: proposeCommitments(trailing.card, user.name?.trim() || "Founder", today()),
        projectName: projectNameFrom(trailing.card.takeaway, view.conversation.title),
        openProjects: openProjects.filter((p) => p.status === "open").map((p) => ({ id: p.id, name: p.name })),
        committed: committed.get(trailing.id) ?? null,
      }
    : null;

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
    <div className="page">
    <div className="space-y-6 min-w-0">
      {/* Who the founder is talking to stays in view (Rally Beta): face, title, expertise, and switching. */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 border-b max-w-none" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="max-w-4xl flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[14rem]">
            <CroIdentity cro={current ? toCroCard(current) : null} collective={network.filter((c) => c.inCollective).map(toCroCard)} />
          </div>
          <PerspectiveSwitch conversationId={view.conversation.id} current={current ? asCro(current) : null} cros={network.map(asCro)} switchTo={switchPerspectiveAction} strongest={strongest.map(asCro)} />
        </div>
      </div>
      <h1 className="font-display text-2xl sm:text-3xl font-normal max-w-4xl" style={fg}>{view.conversation.title}</h1>

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

      {panel && <PlanPanel plan={panel} submit={submitPlanAction} update={updatePlanAction} move={stepStatusAction} answer={answerStepAction} answerFile={answerStepFileAction} blobPrefix={companyBlobPrefix(company.id)} startPlan={startPlanAction} editStep={stepDetailsAction} saveTargets={planTargetsAction} />}

      <BuildingRefresh active={reading} />
      {/* The conversation keeps a readable width; the plan above it uses the whole page. */}
      <ol className="space-y-5 max-w-4xl" aria-label="Conversation">
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
              {(labelAnswers || m.secondOpinion) && (
                <div className="text-sm font-semibold" style={{ color: m.secondOpinion ? "var(--blue)" : "var(--muted-foreground)" }}>{perspectiveOf(m)}</div>
              )}
              <RichReply text={m.content} />
              {rec && rec !== trailing && (
                <FullReasoning>
                  <RecommendationCardView
                    id={rec.id}
                    card={rec.card}
                    given={(view.feedback.get(rec.id) ?? []).map((f) => f.kind)}
                    deeper={null}
                    feedback={feedbackAction}
                    compact
                    informedBy={informedBy(rec.card)}
                  />
                </FullReasoning>
              )}
              <div className="flex items-start gap-2 flex-wrap">
                <ListenButton answer={spoken(m)} />
                <AnswerFeedback messageId={m.id} given={view.messageFeedback.get(m.id) ?? null} rate={rateAnswerAction} />
              </div>
              {rec && rec !== trailing && offer && rec.id === lastCardId && (
                <PlanOffer conversationId={view.conversation.id} planPrice={formatPrice(actionPlanCents)} supportedPrice={formatPrice(supportedMonthlyCents)} buy={buyPlanAction} bookHref="/advisory/book?kind=review" />
              )}
            </li>
          );
        })}
      </ol>

      <div className="max-w-4xl">
      <Composer
        transcribe={voiceConfigured()}
        latestAnswer={lastAnswer && last?.role === "assistant" ? spoken(lastAnswer) : null}
        conversationId={view.conversation.id}
        send={sendMessageAction}
        retry={retryMessageAction}
        awaitingAnswer={last?.role === "user" && !last.documentIds?.length}
        attach={attachFilesAction}
        blobPrefix={companyBlobPrefix(company.id)}
      />
      </div>
      {showNudge(view.messages.filter((m) => m.role === "user").length, Boolean(plan)) && <AdvisorNudge bookHref="/advisory/book?kind=review&offer=nudge" />}
      {trailing && (
        <div className="space-y-4">
          <FullReasoning>
            <RecommendationCardView id={trailing.id} card={trailing.card} given={(view.feedback.get(trailing.id) ?? []).map((f) => f.kind)} deeper={null} feedback={feedbackAction} compact informedBy={informedBy(trailing.card)} />
          </FullReasoning>
          {commit && <CommitToThis {...commit} commit={commitRecommendationAction.bind(null, trailing.id)} />}
          {cro && cro.status === "published" && trailingMessage && !trailingMessage.secondOpinion && <SecondOpinion conversationId={view.conversation.id} cro={cro.name} ask={secondOpinionAction} />}
          {offer && trailing.id === lastCardId && (
            <PlanOffer conversationId={view.conversation.id} planPrice={formatPrice(actionPlanCents)} supportedPrice={formatPrice(supportedMonthlyCents)} buy={buyPlanAction} bookHref="/advisory/book?kind=review" />
          )}
        </div>
      )}
      <p className="text-sm max-w-4xl" style={muted}>
        {current
          ? `Rally is an AI built on ${current.name}'s documented CRO expertise and judgment; ${current.name.split(" ")[0]} isn't reviewing this conversation live. `
          : "Rally's Collective answers draw on the documented expertise and judgment of the CROs in the Growth Goaled network; no one is reviewing this conversation live. "}
        Facts you mention are remembered for your company, so you won&apos;t be asked twice. <Link href="/whats-next#facts" className="link">See or correct them</Link>. Never shown to other
        companies; <Link href="/data-use" className="link">how we use your data</Link>.
      </p>
    </div>
    </div>
  );
}
