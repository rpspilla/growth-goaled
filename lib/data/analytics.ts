import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { answerKey } from "@/lib/intake";
import { computeAnalytics, computeFunnel, FUNNEL_STEPS } from "@/lib/analytics";

/** Derived metrics across real (non-sample) companies. Admin only; callers check the role. */
export async function loadAnalytics() {
  const companies = await db.select({ id: schema.companies.id, createdAt: schema.companies.createdAt }).from(schema.companies).where(eq(schema.companies.isSample, false));
  const ids = companies.map((c) => c.id);
  if (!ids.length) return computeAnalytics({ companies, intake: [], documents: [], events: [], reviews: [], published: [] });
  const [intake, documents, events, reviews, published] = await Promise.all([
    db.select().from(schema.intakeResponses).where(inArray(schema.intakeResponses.companyId, ids)),
    db.select({ companyId: schema.documents.companyId }).from(schema.documents).where(inArray(schema.documents.companyId, ids)),
    db.select({ name: schema.events.name, companyId: schema.events.companyId, createdAt: schema.events.createdAt, props: schema.events.props }).from(schema.events),
    db
      .select({ review: schema.reviews, companyId: schema.deliverables.companyId })
      .from(schema.reviews)
      .innerJoin(schema.deliverables, eq(schema.deliverables.id, schema.reviews.deliverableId))
      .where(inArray(schema.deliverables.companyId, ids)),
    db
      .select({ id: schema.deliverables.id, companyId: schema.deliverables.companyId, version: schema.deliverables.version })
      .from(schema.deliverables)
      .where(and(inArray(schema.deliverables.companyId, ids), eq(schema.deliverables.status, "published"), eq(schema.deliverables.type, "benchmark"))),
  ]);
  const real = new Set(ids);
  return computeAnalytics({
    companies,
    intake: intake.map((r) => ({ companyId: r.companyId, key: answerKey(r.section, r.field), value: r.value })),
    documents,
    events: events.filter((e) => !e.companyId || real.has(e.companyId)),
    reviews: reviews.map(({ review, companyId }) => ({
      deliverableId: review.deliverableId,
      companyId,
      version: review.version,
      decision: review.decision,
      // QA writes the review row; the advisor's decision updates it.
      qaAt: review.qaResults ? review.createdAt : null,
      decidedAt: review.decision ? review.updatedAt : null,
    })),
    published,
  });
}

/** The sign-up → first value → purchase funnel over the last 30 days, founders only (staff and sample excluded). */
export async function loadFunnel() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const names = [...FUNNEL_STEPS.map((s) => s.key), "signup_failed"];
  const rows = await db
    .select({ name: schema.events.name, userId: schema.events.userId, props: schema.events.props, role: schema.users.role })
    .from(schema.events)
    .leftJoin(schema.users, eq(schema.users.id, schema.events.userId))
    .where(and(inArray(schema.events.name, names), gte(schema.events.createdAt, since)));
  return computeFunnel(rows.filter((r) => !r.role || r.role === "founder").map((r) => ({ name: r.name, userId: r.userId, props: (r.props as Record<string, unknown> | null) ?? null })));
}
