import "server-only";
import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import type { Result } from "./projects";

/**
 * Decisions (Nov 25, 2026, after Ben Carcio's walkthrough): the recommendations a founder saved for
 * later or committed to, in one place. Saving is a bookmark; committing ("Commit to this") turns the
 * next steps into tracked commitments. Conversations themselves are always saved.
 */

/** Save a recommendation for later, or un-save it. Only the company's own. */
export async function setRecommendationSaved(user: Pick<User, "id">, company: Pick<Company, "id">, recommendationId: string, saved: boolean): Promise<Result> {
  const [row] = await db
    .update(schema.recommendations)
    .set({ savedAt: saved ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(schema.recommendations.id, recommendationId), eq(schema.recommendations.companyId, company.id)))
    .returning({ id: schema.recommendations.id });
  if (!row) return { ok: false, error: "That recommendation wasn't found." };
  await track(saved ? "recommendation_saved" : "recommendation_unsaved", { userId: user.id, companyId: company.id });
  return { ok: true };
}

export type DecisionView = {
  id: string;
  takeaway: string;
  recommendation: string;
  question: string;
  conversationId: string | null;
  conversationTitle: string | null;
  croId: string | null;
  status: "saved" | "committed";
  projectId: string | null;
  at: Date;
};

/** The company's saved and committed recommendations, newest first, with the conversation and (for committed ones) the growth project. */
export async function listDecisions(company: Pick<Company, "id">): Promise<DecisionView[]> {
  const rows = await db
    .select({ rec: schema.recommendations, title: schema.conversations.title, croId: schema.conversations.croId })
    .from(schema.recommendations)
    .leftJoin(schema.conversations, eq(schema.conversations.id, schema.recommendations.conversationId))
    .where(and(eq(schema.recommendations.companyId, company.id), or(isNotNull(schema.recommendations.savedAt), eq(schema.recommendations.status, "committed"))))
    .orderBy(desc(schema.recommendations.updatedAt));
  const ids = rows.map((r) => r.rec.id);
  const projects = ids.length
    ? await db.select({ id: schema.growthProjects.id, rec: schema.growthProjects.recommendationId }).from(schema.growthProjects).where(eq(schema.growthProjects.companyId, company.id))
    : [];
  const projectFor = new Map(projects.filter((p) => p.rec).map((p) => [p.rec!, p.id]));
  return rows.map(({ rec, title, croId }) => ({
    id: rec.id,
    takeaway: rec.card.takeaway,
    recommendation: rec.card.recommendation,
    question: rec.question,
    conversationId: rec.conversationId,
    conversationTitle: title,
    croId,
    status: rec.status === "committed" ? "committed" : "saved",
    projectId: projectFor.get(rec.id) ?? null,
    at: rec.savedAt ?? rec.updatedAt,
  }));
}
