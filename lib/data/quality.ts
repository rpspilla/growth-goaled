import "server-only";
import { eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getChatTopic } from "@/lib/chat/topics";

/**
 * How well the AI CRO is doing (Nov 24, 2026), from what founders did with its advice: per question
 * topic, per CRO (and the Collective), and per intelligence record. Sample companies are left out.
 */

export type QualityRow = {
  key: string;
  label: string;
  conversations: number;
  recommendations: number;
  committed: number;
  helpful: number;
  /** Rated incorrect, incomplete, not relevant or disagree. */
  pushback: number;
  worked: number;
  partly: number;
  didnt: number;
};
export type RecordUse = { id: string; title: string; cro: string; uses: number; worked: number; partly: number; didnt: number };
export type Contribution = { croId: string; name: string; records: number; validated: number; awaitingReview: number; corrections: number; uses: number; worked: number; partly: number; didnt: number };

const empty = (key: string, label: string): QualityRow => ({ key, label, conversations: 0, recommendations: 0, committed: 0, helpful: 0, pushback: 0, worked: 0, partly: 0, didnt: 0 });
const PUSHBACK = new Set(["incorrect", "incomplete", "not_relevant", "disagree"]);

export async function qualityReport(): Promise<{ topics: QualityRow[]; cros: QualityRow[]; records: RecordUse[]; contributions: Contribution[] }> {
  const [convs, recs, feedback, commitments, messages, records, cros] = await Promise.all([
    db
      .select({ id: schema.conversations.id, topic: schema.conversations.topic, croId: schema.conversations.croId, sample: schema.companies.isSample })
      .from(schema.conversations)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.conversations.companyId)),
    db.select({ id: schema.recommendations.id, conversationId: schema.recommendations.conversationId, status: schema.recommendations.status, card: schema.recommendations.card }).from(schema.recommendations),
    db.select({ recommendationId: schema.recommendationFeedback.recommendationId, kind: schema.recommendationFeedback.kind }).from(schema.recommendationFeedback),
    db.select({ recommendationId: schema.commitments.recommendationId, outcome: schema.commitments.outcome }).from(schema.commitments).where(isNotNull(schema.commitments.outcome)),
    db.select({ conversationId: schema.conversationMessages.conversationId, ids: schema.conversationMessages.intelligenceIds }).from(schema.conversationMessages).where(isNotNull(schema.conversationMessages.intelligenceIds)),
    db
      .select({ id: schema.croIntelligence.id, title: schema.croIntelligence.title, cro: schema.croProfiles.name, croId: schema.croIntelligence.primaryCroId, status: schema.croIntelligence.status, type: schema.croIntelligence.type })
      .from(schema.croIntelligence)
      .leftJoin(schema.croProfiles, eq(schema.croProfiles.id, schema.croIntelligence.primaryCroId)),
    db.select({ id: schema.croProfiles.id, name: schema.croProfiles.name }).from(schema.croProfiles),
  ]);
  const real = new Map(convs.filter((c) => !c.sample).map((c) => [c.id, c]));
  const croName = new Map(cros.map((c) => [c.id, c.name]));
  const topics = new Map<string, QualityRow>();
  const byCro = new Map<string, QualityRow>();
  const rowsFor = (convId: string | null) => {
    const c = convId ? real.get(convId) : undefined;
    if (!c) return [];
    const tKey = c.topic;
    if (!topics.has(tKey)) topics.set(tKey, empty(tKey, tKey === "other" ? "In their own words" : (getChatTopic(tKey)?.starter ?? tKey)));
    const cKey = c.croId ?? "collective";
    if (!byCro.has(cKey)) byCro.set(cKey, empty(cKey, c.croId ? `${croName.get(c.croId) ?? "A CRO"}'s AI` : "Rally Collective"));
    return [topics.get(tKey)!, byCro.get(cKey)!];
  };
  for (const id of real.keys()) for (const r of rowsFor(id)) r.conversations++;
  const recConv = new Map(recs.map((r) => [r.id, r.conversationId]));
  for (const r of recs) for (const row of rowsFor(r.conversationId)) {
    row.recommendations++;
    if (r.status === "committed") row.committed++;
  }
  for (const f of feedback) for (const row of rowsFor(recConv.get(f.recommendationId) ?? null)) {
    if (f.kind === "helpful" || f.kind === "implemented") row.helpful++;
    else if (PUSHBACK.has(f.kind)) row.pushback++;
  }
  for (const c of commitments) for (const row of rowsFor(c.recommendationId ? (recConv.get(c.recommendationId) ?? null) : null)) row[c.outcome!]++;

  // Records: how often answers drew on each, and how the commitments from cards that cited it went.
  const uses = new Map<string, number>();
  for (const m of messages) if (real.has(m.conversationId)) for (const id of m.ids ?? []) uses.set(id, (uses.get(id) ?? 0) + 1);
  const outcomesByRec = new Map<string, { worked: number; partly: number; didnt: number }>();
  const recSources = new Map(recs.map((r) => [r.id, (r.card.sources ?? []).map((s) => s.id)]));
  for (const c of commitments) {
    if (!c.recommendationId || !real.has(recConv.get(c.recommendationId) ?? "")) continue;
    for (const id of recSources.get(c.recommendationId) ?? []) {
      const o = outcomesByRec.get(id) ?? { worked: 0, partly: 0, didnt: 0 };
      o[c.outcome!]++;
      outcomesByRec.set(id, o);
    }
  }
  const recordRows = records
    .map((r) => ({ id: r.id, title: r.title, cro: r.cro ?? "Network position", uses: uses.get(r.id) ?? 0, ...(outcomesByRec.get(r.id) ?? { worked: 0, partly: 0, didnt: 0 }) }))
    .filter((r) => r.uses > 0)
    .sort((a, b) => b.uses - a.uses);
  // Each CRO's contribution: their records, how many are validated or waiting, corrections, and how answers used them.
  const contributions: Contribution[] = cros
    .map((c) => {
      const theirs = records.filter((r) => r.croId === c.id);
      const used = theirs.map((r) => ({ uses: uses.get(r.id) ?? 0, ...(outcomesByRec.get(r.id) ?? { worked: 0, partly: 0, didnt: 0 }) }));
      return {
        croId: c.id,
        name: c.name,
        records: theirs.length,
        validated: theirs.filter((r) => r.status === "validated").length,
        awaitingReview: theirs.filter((r) => r.status === "submitted").length,
        corrections: theirs.filter((r) => r.type === "correction").length,
        uses: used.reduce((a, u) => a + u.uses, 0),
        worked: used.reduce((a, u) => a + u.worked, 0),
        partly: used.reduce((a, u) => a + u.partly, 0),
        didnt: used.reduce((a, u) => a + u.didnt, 0),
      };
    })
    .sort((a, b) => b.uses - a.uses || b.records - a.records);
  const sort = (m: Map<string, QualityRow>) => [...m.values()].sort((a, b) => b.conversations - a.conversations);
  return { topics: sort(topics), cros: sort(byCro), records: recordRows, contributions };
}
