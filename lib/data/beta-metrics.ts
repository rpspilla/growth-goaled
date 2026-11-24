import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getChatTopic } from "@/lib/chat/topics";

/**
 * Rally Beta metrics (Nov 24, 2026): activation, repeat usage and helpfulness, from the existing
 * tables (founders only; staff and test accounts with other roles are left out). Computed in code:
 * the Beta is small, and every number is a plain count of rows anyone can check.
 */

const DAY = 86_400_000;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export type BetaMetrics = Awaited<ReturnType<typeof betaMetrics>>;

export async function betaMetrics(now = new Date()) {
  const [founders, conversations, messages, ratings, feedback] = await Promise.all([
    db.select({ id: schema.users.id, createdAt: schema.users.createdAt, onboardedAt: schema.users.onboardedAt }).from(schema.users).where(eq(schema.users.role, "founder")),
    db.select({ id: schema.conversations.id, userId: schema.conversations.userId, croId: schema.conversations.croId, topic: schema.conversations.topic, title: schema.conversations.title, createdAt: schema.conversations.createdAt }).from(schema.conversations),
    db.select({ conversationId: schema.conversationMessages.conversationId, role: schema.conversationMessages.role, croId: schema.conversationMessages.croId, createdAt: schema.conversationMessages.createdAt }).from(schema.conversationMessages),
    db.select({ userId: schema.messageFeedback.userId, helpful: schema.messageFeedback.helpful, note: schema.messageFeedback.note, updatedAt: schema.messageFeedback.updatedAt }).from(schema.messageFeedback),
    db.select({ answers: schema.betaFeedback.answers, source: schema.betaFeedback.source, createdAt: schema.betaFeedback.createdAt, name: schema.users.name, email: schema.users.email }).from(schema.betaFeedback).innerJoin(schema.users, eq(schema.users.id, schema.betaFeedback.userId)).orderBy(desc(schema.betaFeedback.createdAt)),
  ]);
  const founderIds = new Set(founders.map((f) => f.id));
  const convs = conversations.filter((c) => c.userId && founderIds.has(c.userId));
  const convById = new Map(convs.map((c) => [c.id, c]));
  const byFounder = new Map<string, { convs: typeof convs; firstAnswer: Date | null; activeDays: Set<string>; continued: boolean; lastActive: Date | null }>();
  for (const f of founders) byFounder.set(f.id, { convs: [], firstAnswer: null, activeDays: new Set(), continued: false, lastActive: null });
  for (const c of convs) byFounder.get(c.userId!)!.convs.push(c);
  for (const m of messages) {
    const c = convById.get(m.conversationId);
    if (!c) continue;
    const f = byFounder.get(c.userId!)!;
    if (m.role === "assistant" && (!f.firstAnswer || m.createdAt < f.firstAnswer)) f.firstAnswer = m.createdAt;
    if (m.role === "user") {
      f.activeDays.add(m.createdAt.toISOString().slice(0, 10));
      if (!f.lastActive || m.createdAt > f.lastActive) f.lastActive = m.createdAt;
      // Came back to a conversation more than a day after it started
      if (m.createdAt.getTime() - c.createdAt.getTime() > DAY) f.continued = true;
    }
  }
  const founderRatings = ratings.filter((r) => founderIds.has(r.userId));
  const unhappy = new Set(founderRatings.filter((r) => !r.helpful).map((r) => r.userId));
  const happy = new Set(founderRatings.filter((r) => r.helpful).map((r) => r.userId));
  const list = founders.map((f) => ({ ...f, ...byFounder.get(f.id)! }));
  const started = list.filter((f) => f.convs.length > 0);
  const answered = list.filter((f) => f.firstAnswer);
  // Activated: a first answer, and not only unhelpful ratings
  const activated = answered.filter((f) => !unhappy.has(f.id) || happy.has(f.id));
  const returning = started.filter((f) => f.activeDays.size >= 2);
  const helpfulCount = founderRatings.filter((r) => r.helpful).length;
  // After a helpful answer, did they start another conversation?
  const firstHelpful = new Map<string, Date>();
  for (const r of founderRatings) if (r.helpful && (!firstHelpful.has(r.userId) || r.updatedAt < firstHelpful.get(r.userId)!)) firstHelpful.set(r.userId, r.updatedAt);
  const cameBackAfterHelpful = [...firstHelpful].filter(([u, at]) => byFounder.get(u)!.convs.some((c) => c.createdAt > at)).length;

  const topics = new Map<string, number>();
  for (const c of convs) topics.set(c.topic, (topics.get(c.topic) ?? 0) + 1);
  const individual = convs.filter((c) => c.croId).length;

  return {
    activation: {
      signups: founders.length,
      signupsThisWeek: founders.filter((f) => now.getTime() - f.createdAt.getTime() < 7 * DAY).length,
      onboarded: list.filter((f) => f.onboardedAt).length,
      startedConversation: started.length,
      receivedAnswer: answered.length,
      activated: activated.length,
      activatedPct: pct(activated.length, founders.length),
      medianHoursToFirstAnswer: (() => {
        const h = median(answered.map((f) => (f.firstAnswer!.getTime() - f.createdAt.getTime()) / 3_600_000).filter((x) => x >= 0));
        return h === null ? null : Math.round(h * 10) / 10;
      })(),
    },
    repeat: {
      weeklyActive: list.filter((f) => f.lastActive && now.getTime() - f.lastActive.getTime() < 7 * DAY).length,
      returning: returning.length,
      returningPct: pct(returning.length, started.length),
      secondConversationPct: pct(started.filter((f) => f.convs.length >= 2).length, started.length),
      continuedPct: pct(started.filter((f) => f.continued).length, started.length),
      conversations: convs.length,
      perFounder: started.length ? Math.round((convs.length / started.length) * 10) / 10 : 0,
      individual,
      collective: convs.length - individual,
    },
    helpfulness: {
      rated: founderRatings.length,
      helpful: helpfulCount,
      notHelpful: founderRatings.length - helpfulCount,
      helpfulPct: pct(helpfulCount, founderRatings.length),
      cameBackAfterHelpful,
      ratedHelpfulFounders: firstHelpful.size,
      feedbackSubmitted: feedback.length,
      notHelpfulNotes: founderRatings.filter((r) => !r.helpful && r.note).sort((a, b) => +b.updatedAt - +a.updatedAt).slice(0, 10).map((r) => ({ note: r.note!, at: r.updatedAt })),
    },
    topQuestions: [...topics]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([topic, n]) => ({ topic, label: topic === "other" ? "Their own question" : (getChatTopic(topic)?.starter ?? topic), n })),
    recentOwnQuestions: convs.filter((c) => c.topic === "other").sort((a, b) => +b.createdAt - +a.createdAt).slice(0, 10).map((c) => c.title),
    feedback: feedback.slice(0, 20),
  };
}
