import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, RecommendationCard, User } from "@/lib/db/schema";
import { ChatError, chatTurn, type ChatOutput } from "@/lib/ai/chat";
import { isAiConfigError } from "@/lib/ai/config";
import { characteristics, chatContext } from "@/lib/chat/context";
import { CHAT_METHODOLOGY_VERSION, getChatTopic } from "@/lib/chat/topics";
import { track } from "@/lib/events";

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
  const recIds = messages.flatMap((m) => (m.recommendationId ? [m.recommendationId] : []));
  const [recs, feedback] = recIds.length
    ? await Promise.all([
        db.select().from(schema.recommendations).where(inArray(schema.recommendations.id, recIds)),
        db.select().from(schema.recommendationFeedback).where(inArray(schema.recommendationFeedback.recommendationId, recIds)).orderBy(desc(schema.recommendationFeedback.createdAt)),
      ])
    : [[], []];
  return {
    conversation,
    messages,
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

function cardFrom(output: NonNullable<ChatOutput["recommendation"]>): RecommendationCard {
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
  };
}

const FACT_KEY = /^[a-z][a-z0-9_]{0,59}$/;

/** Starts a conversation. A starter's own question is the founder's first message; "Something else" needs their words. */
export async function startConversation(
  user: User,
  company: Company,
  topicId: string,
  text: string | null,
): Promise<{ ok: false; error: string } | { ok: true; conversationId: string; error: string | null }> {
  const topic = getChatTopic(topicId);
  if (!topic) return { ok: false, error: "Unknown question." };
  const first = (text ?? "").trim() || (topic.id === "other" ? "" : topic.starter);
  if (!first) return { ok: false, error: "Tell us what you'd like to work through." };
  const title = (topic.id === "other" ? first : topic.starter).slice(0, 120);
  const [conversation] = await db.insert(schema.conversations).values({ companyId: company.id, userId: user.id, topic: topic.id, title }).returning({ id: schema.conversations.id });
  await track("conversation_started", { userId: user.id, companyId: company.id, props: { topic: topic.id } });
  const sent = await sendMessage(user, company, conversation!.id, first);
  // The conversation exists either way; a failed first answer can be retried from its page.
  return { ok: true, conversationId: conversation!.id, error: sent.ok ? null : sent.error };
}

/** Saves the founder's message, answers it with the company's context, and keeps any facts and recommendation it produces. */
export async function sendMessage(user: User, company: Company, conversationId: string, raw: string): Promise<ChatResult> {
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
  const history = [...view.messages.map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: text }];
  const context = await chatContext(company, { compensation: Boolean(topic.usesCompensationData) });

  let result;
  try {
    result = await chatTurn({ topic, context, history });
  } catch (err) {
    console.error("[chat] Turn failed", err);
    const error = err instanceof ChatError ? err.message : isAiConfigError(err) ? "Answers aren't available right now. Your message is saved; try again shortly." : "Something went wrong. Your message is saved; try again.";
    return { ok: false, error };
  }
  const { output } = result;

  await db.transaction(async (tx) => {
    for (const f of output.facts) {
      const key = f.key.trim().toLowerCase();
      if (!FACT_KEY.test(key) || !f.value.trim()) continue;
      // A fact an advisor or the founder marked verified isn't overwritten by conversation.
      await tx
        .insert(schema.companyFacts)
        .values({ companyId: company.id, key, label: f.label.slice(0, 120), value: f.value.slice(0, 500), status: f.status, conversationId, updatedBy: user.id })
        .onConflictDoUpdate({
          target: [schema.companyFacts.companyId, schema.companyFacts.key],
          set: { label: sql`excluded.label`, value: sql`excluded.value`, status: sql`excluded.status`, conversationId, updatedBy: user.id, updatedAt: new Date() },
          setWhere: sql`${schema.companyFacts.status} <> 'verified'`,
        });
    }
    let recommendationId: string | null = null;
    if (output.recommendation) {
      const [rec] = await tx
        .insert(schema.recommendations)
        .values({
          companyId: company.id,
          conversationId,
          topic: topic.id,
          question: view.conversation.title,
          context: characteristics(company),
          card: cardFrom(output.recommendation),
          confidence: output.recommendation.confidence.level,
          methodologyVersion: CHAT_METHODOLOGY_VERSION,
          model: result.model,
        })
        .returning({ id: schema.recommendations.id });
      recommendationId = rec!.id;
    }
    await tx.insert(schema.conversationMessages).values({
      conversationId,
      role: "assistant",
      content: output.reply,
      questions: output.questions,
      recommendationId,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });
    await tx.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));
  });
  await track("conversation_message", { userId: user.id, companyId: company.id, props: { topic: topic.id, recommendation: Boolean(output.recommendation) } });
  return { ok: true };
}

/** Answers the founder's last message again (after a failed turn). */
export async function retryLastMessage(user: User, company: Company, conversationId: string): Promise<ChatResult> {
  const view = await getConversation(company, conversationId);
  const last = view?.messages.at(-1);
  if (!view || !last || last.role !== "user") return { ok: false, error: "Nothing to retry." };
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
