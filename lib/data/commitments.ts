import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Commitment, Company, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { MAX_COMMITMENTS, type CommitmentDraft } from "@/lib/commitments";
import { today, type Result } from "./projects";

/**
 * Commitments (AI CRO sprint, Nov 23, 2026): a decision card's next steps, turned into tracked work
 * inside a growth project with "Commit to this". The founder commits and ticks them off; advisors see
 * them on the company's projects; the AI CRO sees them in every conversation.
 */

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
const clean = (v: string | null | undefined, max: number) => v?.trim().slice(0, max) || null;

export type CommitInput = {
  /** A new project (named) or one of the company's open projects. */
  project: { kind: "new"; name: string } | { kind: "existing"; id: string };
  items: CommitmentDraft[];
};

/**
 * "Commit to this": the card's chosen next steps become commitments in a growth project (a new one,
 * linked to the conversation and card, or an open one), and the card is marked committed.
 */
export async function commitRecommendation(user: Pick<User, "id">, company: Pick<Company, "id">, recommendationId: string, input: CommitInput): Promise<Result<{ projectId: string }>> {
  const [rec] = await db
    .select({ id: schema.recommendations.id, conversationId: schema.recommendations.conversationId, status: schema.recommendations.status })
    .from(schema.recommendations)
    .where(and(eq(schema.recommendations.id, recommendationId), eq(schema.recommendations.companyId, company.id)))
    .limit(1);
  if (!rec) return { ok: false, error: "That recommendation wasn't found." };
  if (rec.status === "committed") return { ok: false, error: "You've already committed to this one." };

  const items: CommitmentDraft[] = [];
  for (const [n, raw] of input.items.entries()) {
    const title = clean(raw.title, 300);
    if (!title) continue;
    const owner = clean(raw.owner, 80);
    if (!owner) return { ok: false, error: `Commitment ${n + 1}: say who owns it.` };
    if (raw.dueOn && !isDay(raw.dueOn)) return { ok: false, error: `Commitment ${n + 1}: pick a valid due date.` };
    items.push({ title, owner, dueOn: raw.dueOn || null, measure: clean(raw.measure, 300) });
  }
  if (!items.length) return { ok: false, error: "Keep at least one commitment." };
  if (items.length > MAX_COMMITMENTS) return { ok: false, error: `At most ${MAX_COMMITMENTS} commitments at a time.` };

  let projectId: string;
  if (input.project.kind === "existing") {
    const [p] = await db
      .select({ id: schema.growthProjects.id, status: schema.growthProjects.status })
      .from(schema.growthProjects)
      .where(and(eq(schema.growthProjects.id, input.project.id), eq(schema.growthProjects.companyId, company.id)))
      .limit(1);
    if (!p) return { ok: false, error: "That project wasn't found." };
    if (p.status !== "open") return { ok: false, error: "That project is completed; start a new one." };
    projectId = p.id;
  } else {
    const name = clean(input.project.name, 120);
    if (!name) return { ok: false, error: "Name the project." };
    const [p] = await db
      .insert(schema.growthProjects)
      .values({ companyId: company.id, name, startedOn: today(), conversationId: rec.conversationId, recommendationId: rec.id, createdBy: user.id })
      .returning({ id: schema.growthProjects.id });
    projectId = p!.id;
  }

  const [{ next } = { next: 0 }] = await db
    .select({ next: schema.commitments.position })
    .from(schema.commitments)
    .where(eq(schema.commitments.projectId, projectId))
    .orderBy(desc(schema.commitments.position))
    .limit(1);
  await db.insert(schema.commitments).values(
    items.map((c, i) => ({ companyId: company.id, projectId, recommendationId: rec.id, conversationId: rec.conversationId, title: c.title, owner: c.owner, dueOn: c.dueOn, measure: c.measure, position: next + i + 1, createdBy: user.id })),
  );
  await db.update(schema.recommendations).set({ status: "committed", updatedAt: new Date() }).where(eq(schema.recommendations.id, rec.id));
  await track("recommendation_committed", { userId: user.id, companyId: company.id, props: { commitments: items.length, newProject: input.project.kind === "new" } });
  return { ok: true, projectId };
}

/** Open first (soonest due first, undated last), then the rest newest first; optionally one project's. */
export async function companyCommitments(company: Pick<Company, "id">, opts: { projectIds?: string[]; status?: Commitment["status"][] } = {}): Promise<Commitment[]> {
  if (opts.projectIds && !opts.projectIds.length) return [];
  const rows = await db
    .select()
    .from(schema.commitments)
    .where(
      and(
        eq(schema.commitments.companyId, company.id),
        ...(opts.projectIds ? [inArray(schema.commitments.projectId, opts.projectIds)] : []),
        ...(opts.status ? [inArray(schema.commitments.status, opts.status)] : []),
      ),
    )
    .orderBy(asc(schema.commitments.position), asc(schema.commitments.createdAt));
  const open = rows.filter((c) => c.status === "open").sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const closed = rows.filter((c) => c.status !== "open").sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0));
  return [...open, ...closed];
}

/** Tick a commitment done, drop it, or reopen it. */
export async function setCommitmentStatus(user: Pick<User, "id">, company: Pick<Company, "id">, commitmentId: string, status: Commitment["status"]): Promise<Result> {
  const updated = await db
    .update(schema.commitments)
    .set({ status, closedAt: status === "open" ? null : new Date(), updatedAt: new Date() })
    .where(and(eq(schema.commitments.id, commitmentId), eq(schema.commitments.companyId, company.id)))
    .returning({ id: schema.commitments.id });
  if (!updated.length) return { ok: false, error: "That commitment wasn't found." };
  await track("commitment_status", { userId: user.id, companyId: company.id, props: { status } });
  return { ok: true };
}

/** The committed recommendations among these ids, with the project each became. */
export async function committedProjects(company: Pick<Company, "id">, recommendationIds: string[]): Promise<Map<string, { id: string; name: string }>> {
  if (!recommendationIds.length) return new Map();
  const rows = await db
    .selectDistinct({ rec: schema.commitments.recommendationId, id: schema.growthProjects.id, name: schema.growthProjects.name })
    .from(schema.commitments)
    .innerJoin(schema.growthProjects, eq(schema.growthProjects.id, schema.commitments.projectId))
    .where(and(eq(schema.commitments.companyId, company.id), inArray(schema.commitments.recommendationId, recommendationIds)));
  return new Map(rows.flatMap((r) => (r.rec ? [[r.rec, { id: r.id, name: r.name }] as const] : [])));
}
