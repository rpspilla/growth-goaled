import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { answerKey } from "@/lib/intake";
import { computeAnalytics } from "@/lib/analytics";

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
