import "server-only";
import { nudgeDue } from "@/lib/chat/nudge";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, RecommendationCard, User } from "@/lib/db/schema";
import { ChatError, chatTurn, type ChatOutput } from "@/lib/ai/chat";
import { isAiConfigError } from "@/lib/ai/config";
import { characteristics, chatContext } from "@/lib/chat/context";
import { CHAT_METHODOLOGY_VERSION, getChatTopic } from "@/lib/chat/topics";
import { track } from "@/lib/events";
import { registerDocument } from "./documents";
import { sendEmail } from "@/lib/email";
import { intelligenceFor, publishedCro } from "./cro";

/** Founder messages per company per rolling 24 hours (CHAT_DAILY_LIMIT, default 80): chat is free, so it's capped. */
export const chatDailyLimit = () => {
  const n = Number(process.env.CHAT_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 80;
};
export const MAX_MESSAGE_LENGTH = 4000;

export type ChatResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function listConversations(company: Pick<Company, "id">, limit = 20) {
  return db
    .select({ id: schema.conversations.id, title: schema.conversations.title, topic: schema.conversations.topic, updatedAt: schema.conversations.updatedAt })
    .from(schema.conversations)
    .where(eq(schema.conversations.companyId, company.id))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(limit);
}

export type ConversationView = NonNullable<Awaited<ReturnType<typeof getConversation>>>;

/** One conversation of this company, with its messages, the recommendations given and the founder's feedback on them. */
export async function getConversation(company: Pick<Company, "id">, conversationId: string) {
  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.companyId, company.id)))
    .limit(1);
  if (!conversation) return null;
  const messages = await db
    .select()
    .from(schema.conversationMessages)
    .where(eq(schema.conversationMessages.conversationId, conversation.id))
    .orderBy(asc(schema.conversationMessages.createdAt));
  const authorIds = [...new Set(messages.flatMap((m) => (m.authorId ? [m.authorId] : [])))];
  const authors = authorIds.length ? await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, authorIds)) : [];
  const docIds = [...new Set(messages.flatMap((m) => m.documentIds ?? []))];
  const docs = docIds.length
    ? await db.select({ id: schema.documents.id, filename: schema.documents.filename, status: schema.documents.status }).from(schema.documents).where(and(inArray(schema.documents.id, docIds), eq(schema.documents.companyId, company.id)))
    : [];
  const [plan] = await db.select().from(schema.actionPlans).where(eq(schema.actionPlans.conversationId, conversation.id)).limit(1);
  const recIds = messages.flatMap((m) => (m.recommendationId ? [m.recommendationId] : []));
  const [recs, feedback] = recIds.length
    ? await Promise.all([
        db.select().from(schema.recommendations).where(inArray(schema.recommendations.id, recIds)),
        db.select().from(schema.recommendationFeedback).where(inArray(schema.recommendationFeedback.recommendationId, recIds)).orderBy(desc(schema.recommendationFeedback.createdAt)),
      ])
    : [[], []];
  // The CROs whose perspectives appear (the conversation's and each answer's), by name.
  const croIds = [...new Set([conversation.croId, ...messages.map((m) => m.croId)].filter((x): x is string => Boolean(x)))];
  const cros = croIds.length ? await db.select({ id: schema.croProfiles.id, name: schema.croProfiles.name }).from(schema.croProfiles).where(inArray(schema.croProfiles.id, croIds)) : [];
  return {
    conversation,
    messages,
    cros: new Map(cros.map((c) => [c.id, c.name])),
    plan: plan ?? null,
    authors: new Map(authors.map((a) => [a.id, a.name || a.email])),
    documents: new Map(docs.map((d) => [d.id, d])),
    recommendations: new Map(recs.map((r) => [r.id, r])),
    feedback: new Map(recIds.map((id) => [id, feedback.filter((f) => f.recommendationId === id)])),
  };
}

async function messagesToday(company: Pick<Company, "id">): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.conversationMessages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.conversationMessages.conversationId))
    .where(and(eq(schema.conversations.companyId, company.id), eq(schema.conversationMessages.role, "user"), gte(schema.conversationMessages.createdAt, since)));
  return row?.n ?? 0;
}

function cardFrom(output: NonNullable<ChatOutput["recommendation"]>, sources: { id: string; how: string }[]): RecommendationCard {
  return {
    takeaway: output.takeaway,
    diagnosis: output.diagnosis,
    evidence: output.evidence,
    confidence: output.confidence,
    priority: output.priority,
    recommendation: output.recommendation,
    nextSteps: output.next_steps,
    successMeasures: output.success_measures,
    plan: { days30: output.plan_30, days60: output.plan_60, days90: output.plan_90 },
    missing: output.missing,
    tradeoffs: output.tradeoffs.slice(0, 4),
    alternatives: output.alternatives.slice(0, 4).map((a) => ({ option: a.option, whyNot: a.why_not })),
    ...(output.perspectives.length ? { perspectives: output.perspectives.slice(0, 4) } : {}),
    ...(sources.length ? { sources } : {}),
  };
}

const FACT_KEY = /^[a-z][a-z0-9_]{0,59}$/;

/** Starts a conversation. A starter's own question is the founder's first message; "Something else" needs their words. */
export async function startConversation(
  user: User,
  company: Company,
  topicId: string,
  text: string | null,
  /** A published CRO's AI representation; null for the Growth Goaled Collective; undefined: the company's default. */
  croId?: string | null,
): Promise<{ ok: false; error: string } | { ok: true; conversationId: string; error: string | null }> {
  const topic = getChatTopic(topicId);
  if (!topic) return { ok: false, error: "Unknown question." };
  const wanted = croId === undefined ? (company.defaultCroId ?? null) : croId;
  const cro = wanted ? await publishedCro(wanted) : null;
  // An explicit choice must be available; a stale default (unpublished since) falls back to the Collective.
  if (croId && !cro) return { ok: false, error: "That CRO isn't available." };
  const first = topic.id === "other" ? (text ?? "").trim() : topic.starter;
  if (!first) return { ok: false, error: "Tell us what you'd like to work through." };
  const title = (topic.id === "other" ? first : topic.starter).slice(0, 120);
  const [conversation] = await db.insert(schema.conversations).values({ companyId: company.id, userId: user.id, topic: topic.id, title, croId: cro?.id ?? null }).returning({ id: schema.conversations.id });
  await track("conversation_started", { userId: user.id, companyId: company.id, props: { topic: topic.id, cro: cro ? cro.slug : "collective" } });
  const sent = await sendMessage(user, company, conversation!.id, first);
  // The conversation exists either way; a failed first answer can be retried from its page.
  return { ok: true, conversationId: conversation!.id, error: sent.ok ? null : sent.error };
}

/** Saves the founder's message, answers it with the company's context, and keeps any facts and recommendation it produces. */
export async function sendMessage(user: User, company: Company, conversationId: string, raw: string, opts: { secondOpinion?: boolean } = {}): Promise<ChatResult> {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Type a message first." };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `Keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.` };
  const view = await getConversation(company, conversationId);
  if (!view) return { ok: false, error: "Conversation not found." };
  const topic = getChatTopic(view.conversation.topic) ?? getChatTopic("other")!;
  if ((await messagesToday(company)) >= chatDailyLimit()) {
    return { ok: false, error: "You've reached today's message limit. It resets within 24 hours; your conversation is saved." };
  }

  await db.insert(schema.conversationMessages).values({ conversationId, role: "user", content: text });
  // Whose perspective answers this turn: the conversation's (a CRO's AI or the Collective), or the
  // Collective once, for a second opinion. Earlier answers from another perspective are labelled.
  const perspective = opts.secondOpinion ? null : view.conversation.croId;
  const label = (id: string | null) => (id ? `${view.cros.get(id) ?? "Another CRO"}'s AI CRO` : "the Growth Goaled Collective");
  const history = [
    ...view.messages.map((m) => ({
      role: m.role,
      content: m.role === "assistant" && (m.croId ?? null) !== perspective ? `[Earlier answer from ${label(m.croId ?? null)}]\n${m.content}` : m.content,
      author: m.authorId ? (view.authors.get(m.authorId) ?? null) : null,
    })),
    { role: "user" as const, content: text },
  ];
  const context = await chatContext(company, { compensation: Boolean(topic.usesCompensationData), conversationId });
  const plan = view.plan && view.plan.status !== "pending_payment" ? { tier: view.plan.tier, status: view.plan.status, needs: view.plan.needs } : null;
  // The CRO intelligence for this turn: the chosen CRO's, or the Collective's most relevant.
  const intelligence = await intelligenceFor(company, perspective, { text: `${view.conversation.title}\n${text}`, topicId: topic.id });
  const lastCard = [...view.messages].reverse().find((m) => m.recommendationId);
  const secondOpinionOf = opts.secondOpinion && view.conversation.croId && lastCard ? { cro: view.cros.get(view.conversation.croId) ?? "this CRO", card: view.recommendations.get(lastCard.recommendationId!)?.card ?? null } : null;

  let result;
  try {
    result = await chatTurn({ topic, context, history, plan, intelligence, secondOpinionOf, nudge: nudgeDue(history.filter((t) => t.role === "user").length, Boolean(plan)) });
  } catch (err) {
    console.error("[chat] Turn failed", err);
    const error = err instanceof ChatError ? err.message : isAiConfigError(err) ? "Answers aren't available right now. Your message is saved; try again shortly." : "Something went wrong. Your message is saved; try again.";
    return { ok: false, error };
  }
  const { output } = result;
  // Attribution: only records actually given to the model count (an invented id is dropped).
  const given = new Set(intelligence?.records.map((r) => r.id) ?? []);
  const used = output.intelligence_used.filter((u, i, all) => given.has(u.id) && all.findIndex((x) => x.id === u.id) === i).map((u) => ({ id: u.id, how: u.how.slice(0, 300) }));

  // Sequential writes: the production driver (neon-http) has no transactions. The answer is
  // written last, so a failure part-way leaves the founder's message unanswered and retryable.
  let recommendationId: string | null = null;
  if (output.recommendation) {
    const [rec] = await db
      .insert(schema.recommendations)
      .values({
        companyId: company.id,
        conversationId,
        topic: topic.id,
        question: view.conversation.title,
        context: characteristics(company),
        card: cardFrom(output.recommendation, used),
        confidence: output.recommendation.confidence.level,
        methodologyVersion: CHAT_METHODOLOGY_VERSION,
        model: result.model,
      })
      .returning({ id: schema.recommendations.id });
    recommendationId = rec!.id;
  }
  for (const f of output.facts) {
    const key = f.key.trim().toLowerCase();
    if (!FACT_KEY.test(key) || !f.value.trim()) continue;
    // A fact the founder corrected (verified) isn't overwritten by conversation.
    await db
      .insert(schema.companyFacts)
      .values({ companyId: company.id, key, label: f.label.slice(0, 120), value: f.value.slice(0, 500), status: f.status, conversationId, updatedBy: user.id })
      .onConflictDoUpdate({
        target: [schema.companyFacts.companyId, schema.companyFacts.key],
        set: { label: sql`excluded.label`, value: sql`excluded.value`, status: sql`excluded.status`, conversationId, updatedBy: user.id, updatedAt: new Date() },
        setWhere: sql`${schema.companyFacts.status} <> 'verified'`,
      });
  }
  await db.insert(schema.conversationMessages).values({
    conversationId,
    role: "assistant",
    content: output.reply,
    questions: output.questions,
    recommendationId,
    intelligenceIds: used.length ? used.map((u) => u.id) : null,
    croId: perspective,
    secondOpinion: Boolean(opts.secondOpinion),
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  });
  await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));
  // While a $499 plan is being collected, keep what's still needed up to date for the founder.
  if (view.plan?.status === "collecting") {
    await db.update(schema.actionPlans).set({ needs: output.plan_needs.slice(0, 8).map((n) => n.slice(0, 200)), updatedAt: new Date() }).where(eq(schema.actionPlans.id, view.plan.id));
  }
  await track("conversation_message", { userId: user.id, companyId: company.id, props: { topic: topic.id, recommendation: Boolean(output.recommendation) } });
  return { ok: true };
}

/** Answers the founder's last message again (after a failed turn). */
export async function retryLastMessage(user: User, company: Company, conversationId: string): Promise<ChatResult> {
  const view = await getConversation(company, conversationId);
  const last = view?.messages.at(-1);
  if (!view || !last || last.role !== "user" || last.documentIds?.length) return { ok: false, error: "Nothing to retry." };
  await db.delete(schema.conversationMessages).where(eq(schema.conversationMessages.id, last.id));
  return sendMessage(user, company, conversationId, last.content);
}

export const FEEDBACK_KINDS = schema.feedbackKind.enumValues;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export async function giveFeedback(user: User, company: Pick<Company, "id">, recommendationId: string, kind: FeedbackKind, note: string | null): Promise<ChatResult> {
  const [rec] = await db
    .select({ id: schema.recommendations.id, topic: schema.recommendations.topic })
    .from(schema.recommendations)
    .where(and(eq(schema.recommendations.id, recommendationId), eq(schema.recommendations.companyId, company.id)))
    .limit(1);
  if (!rec) return { ok: false, error: "Recommendation not found." };
  await db.insert(schema.recommendationFeedback).values({ recommendationId: rec.id, userId: user.id, kind, note: note?.trim().slice(0, 1000) || null });
  await track("recommendation_feedback", { userId: user.id, companyId: company.id, props: { topic: rec.topic, kind } });
  return { ok: true };
}

export async function listFacts(company: Pick<Company, "id">) {
  return db.select().from(schema.companyFacts).where(eq(schema.companyFacts.companyId, company.id)).orderBy(asc(schema.companyFacts.label));
}

/** The founder corrects a fact: what they confirm becomes verified, so conversation won't overwrite it. */
export async function updateFact(user: User, company: Pick<Company, "id">, factId: string, value: string): Promise<ChatResult> {
  const v = value.trim();
  if (!v) return { ok: false, error: "Enter a value, or remove the fact." };
  const updated = await db
    .update(schema.companyFacts)
    .set({ value: v.slice(0, 500), status: "verified", updatedBy: user.id, updatedAt: new Date() })
    .where(and(eq(schema.companyFacts.id, factId), eq(schema.companyFacts.companyId, company.id)))
    .returning({ id: schema.companyFacts.id });
  return updated.length ? { ok: true } : { ok: false, error: "Fact not found." };
}

export async function removeFact(company: Pick<Company, "id">, factId: string): Promise<ChatResult> {
  const removed = await db
    .delete(schema.companyFacts)
    .where(and(eq(schema.companyFacts.id, factId), eq(schema.companyFacts.companyId, company.id)))
    .returning({ id: schema.companyFacts.id });
  return removed.length ? { ok: true } : { ok: false, error: "Fact not found." };
}

/**
 * Files the founder attaches in the conversation: stored like any upload (read, extracted and sorted
 * by the caller after the response) and noted in the conversation so the next answer knows.
 */
export async function attachFiles(
  user: User,
  company: Company,
  conversationId: string,
  files: { pathname: string; filename: string; contentHash?: string }[],
): Promise<{ ok: true; process: string[] } | { ok: false; error: string }> {
  if (!files.length) return { ok: false, error: "Choose a file." };
  const [conversation] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.companyId, company.id)))
    .limit(1);
  if (!conversation) return { ok: false, error: "Conversation not found." };
  const ids: string[] = [];
  const process: string[] = [];
  for (const f of files) {
    const { doc, duplicate } = await registerDocument(user, company, { ...f, docType: "other" });
    ids.push(doc.id);
    if (!duplicate) process.push(doc.id);
  }
  const names = files.map((f) => f.filename).join(", ");
  await db.insert(schema.conversationMessages).values({ conversationId, role: "user", content: `Shared ${files.length === 1 ? "a file" : "files"}: ${names}`, documentIds: ids });
  await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));
  return { ok: true, process };
}

/**
 * An advisor's note in any conversation of a company they manage (Nov 24, 2026; before, only on
 * supported plans). The AI CRO sees it as the advisor's and follows it. The company's founders are
 * emailed a link, unless the advisor wrote it in the last hour already (one note, one email).
 */
export async function postAdvisorNote(advisor: Pick<User, "id" | "name" | "email">, company: Pick<Company, "id" | "name">, conversationId: string, raw: string, appUrl: string): Promise<ChatResult> {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Type a message first." };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `Keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.` };
  const [conversation] = await db
    .select({ id: schema.conversations.id, title: schema.conversations.title })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.companyId, company.id)))
    .limit(1);
  if (!conversation) return { ok: false, error: "Conversation not found." };
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [recent] = await db
    .select({ id: schema.conversationMessages.id })
    .from(schema.conversationMessages)
    .where(and(eq(schema.conversationMessages.conversationId, conversation.id), eq(schema.conversationMessages.role, "advisor"), eq(schema.conversationMessages.authorId, advisor.id), gte(schema.conversationMessages.createdAt, since)))
    .limit(1);
  await db.insert(schema.conversationMessages).values({ conversationId: conversation.id, role: "advisor", content: text, authorId: advisor.id });
  await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversation.id));
  await track("advisor_message", { userId: advisor.id, companyId: company.id, props: { anyConversation: true } });
  if (!recent) {
    const founders = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.companyMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
      .where(and(eq(schema.companyMembers.companyId, company.id), eq(schema.users.role, "founder")));
    const who = advisor.name?.trim() || "Your Growth Goaled advisor";
    const url = `${appUrl.replace(/\/$/, "")}/chat/${conversation.id}`;
    for (const f of founders) {
      await sendEmail(advisorNoteEmail({ to: f.email, name: f.name, who, title: conversation.title, note: text, url }));
    }
  }
  return { ok: true };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export function advisorNoteEmail(p: { to: string; name: string | null; who: string; title: string; note: string; url: string }) {
  const first = p.name?.split(" ")[0];
  const excerpt = p.note.length > 400 ? `${p.note.slice(0, 397)}…` : p.note;
  return {
    to: p.to,
    subject: `${p.who} added a note: ${p.title.slice(0, 80)}`,
    text: `${first ? `Hi ${first},\n\n` : ""}${p.who} added a note to your conversation "${p.title}":\n\n${excerpt}\n\nReply or keep going with your CRO: ${p.url}`,
    html: `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:520px">${first ? `<p style="font-size:15px">Hi ${esc(first)},</p>` : ""}<p style="font-size:15px"><strong>${esc(p.who)}</strong> added a note to your conversation <strong>${esc(p.title)}</strong>:</p><blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #155A3C;font-size:15px;white-space:pre-wrap">${esc(excerpt)}</blockquote><p><a href="${esc(p.url)}" style="display:inline-block;background:#155A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open the conversation</a></p></div>`,
  };
}

/**
 * Switch whose perspective answers from here on (a published CRO's AI, or null for the Collective).
 * Nothing about the company or the conversation is lost: earlier answers keep their own CRO.
 */
export async function switchPerspective(user: Pick<User, "id">, company: Pick<Company, "id">, conversationId: string, croId: string | null): Promise<ChatResult> {
  const cro = croId ? await publishedCro(croId) : null;
  if (croId && !cro) return { ok: false, error: "That CRO isn't available." };
  const updated = await db
    .update(schema.conversations)
    .set({ croId: cro?.id ?? null, updatedAt: new Date() })
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.companyId, company.id)))
    .returning({ id: schema.conversations.id });
  if (!updated.length) return { ok: false, error: "Conversation not found." };
  await track("perspective_switched", { userId: user.id, companyId: company.id, props: { to: cro ? cro.slug : "collective" } });
  return { ok: true };
}

/** A second opinion from the Collective on the CRO's latest recommendation, in the same conversation. */
export async function secondOpinion(user: User, company: Company, conversationId: string): Promise<ChatResult> {
  const view = await getConversation(company, conversationId);
  if (!view) return { ok: false, error: "Conversation not found." };
  if (!view.conversation.croId) return { ok: false, error: "This conversation is already with the Collective." };
  if (!view.messages.some((m) => m.recommendationId)) return { ok: false, error: "Ask for a second opinion once there's a recommendation." };
  await track("second_opinion", { userId: user.id, companyId: company.id, props: {} });
  return sendMessage(user, company, conversationId, "Second opinion, please: what does the Growth Goaled network think?", { secondOpinion: true });
}

/** The company's default: who its founders talk to unless they choose otherwise. */
export async function setDefaultCro(user: Pick<User, "id">, company: Pick<Company, "id">, croId: string | null): Promise<ChatResult> {
  const cro = croId ? await publishedCro(croId) : null;
  if (croId && !cro) return { ok: false, error: "That CRO isn't available." };
  await db.update(schema.companies).set({ defaultCroId: cro?.id ?? null, updatedAt: new Date() }).where(eq(schema.companies.id, company.id));
  await track("default_cro_set", { userId: user.id, companyId: company.id, props: { to: cro ? cro.slug : "collective" } });
  return { ok: true };
}
