import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { dataReceivedEmail, dataRequestEmail, sendEmail } from "@/lib/email";
import { track } from "@/lib/events";

/** What advisors usually need; they tick these or write their own. */
export const REQUEST_ITEMS = [
  "Latest revenue by month (MRR or ARR)",
  "Retention or churn figures",
  "Pipeline or CRM export",
  "Updated financial model",
  "Sales team roster and targets",
] as const;

/** Where the email sends the founder: the upload area of Performance, through sign-in if needed. */
export const requestLink = (appUrl: string, requestId: string) => `${appUrl}/sign-in?next=${encodeURIComponent(`/performance?request=${requestId}#upload`)}`;

export type DataRequestView = { id: string; items: string[]; message: string | null; createdAt: Date; fulfilledAt: Date | null; requestedBy: string | null };

export async function listDataRequests(companyId: string, opts: { open?: boolean } = {}): Promise<DataRequestView[]> {
  const rows = await db
    .select({ r: schema.dataRequests, by: schema.users.name })
    .from(schema.dataRequests)
    .leftJoin(schema.users, eq(schema.users.id, schema.dataRequests.requestedBy))
    .where(and(eq(schema.dataRequests.companyId, companyId), opts.open ? isNull(schema.dataRequests.fulfilledAt) : undefined))
    .orderBy(desc(schema.dataRequests.createdAt))
    .limit(20);
  return rows.map(({ r, by }) => ({ id: r.id, items: r.items, message: r.message, createdAt: r.createdAt, fulfilledAt: r.fulfilledAt, requestedBy: by }));
}

/** An advisor asks for an update: recorded, then emailed to everyone at the company. */
export async function createDataRequest(actor: User, company: Pick<Company, "id" | "name">, input: { items: string[]; message: string | null }, appUrl: string): Promise<{ ok: true; emailed: number; recipients: number } | { ok: false; error: string }> {
  const items = [...new Set(input.items.map((i) => i.trim()).filter(Boolean))].slice(0, 10);
  const message = input.message?.trim() || null;
  if (!items.length && !message) return { ok: false, error: "Say what you need: tick an item or write a note." };
  const [request] = await db.insert(schema.dataRequests).values({ companyId: company.id, requestedBy: actor.id, items, message }).returning();
  const people = await db
    .select({ email: schema.users.email })
    .from(schema.companyMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(eq(schema.companyMembers.companyId, company.id));
  const msg = dataRequestEmail({ advisorName: actor.name || "Your advisor", companyName: company.name, items, message, link: requestLink(appUrl, request!.id) });
  const sent = await Promise.all(people.map((p) => sendEmail({ to: p.email, ...msg }).catch(() => ({ sent: false as const }))));
  const emailed = sent.filter((s) => s.sent).length;
  await track("data_requested", { userId: actor.id, companyId: company.id, props: { items: items.length, emailed } });
  return { ok: true, emailed, recipients: people.length };
}

/** A founder shared files: open requests count as answered, and whoever asked hears about it. */
export async function answerDataRequests(user: Pick<User, "id" | "name" | "email">, company: Pick<Company, "id" | "name">, filename: string, appUrl: string): Promise<number> {
  const answered = await db
    .update(schema.dataRequests)
    .set({ fulfilledAt: new Date(), fulfilledBy: user.id, updatedAt: new Date() })
    .where(and(eq(schema.dataRequests.companyId, company.id), isNull(schema.dataRequests.fulfilledAt)))
    .returning({ requestedBy: schema.dataRequests.requestedBy });
  const askers = [...new Set(answered.map((a) => a.requestedBy).filter((id): id is string => Boolean(id)))];
  if (askers.length) {
    const advisors = await db.select({ email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, askers));
    const msg = dataReceivedEmail({ companyName: company.name, founderName: user.name || user.email, filename, link: `${appUrl}/advisor/companies/${company.id}/documents` });
    await Promise.all(advisors.map((a) => sendEmail({ to: a.email, ...msg }).catch(() => null)));
  }
  return answered.length;
}

/** The advisor's name for the plan the company is working on (empty clears it). */
export async function setCurrentPlan(company: Pick<Company, "id">, name: string): Promise<void> {
  await db.update(schema.companies).set({ currentPlan: name.trim().slice(0, 120) || null, updatedAt: new Date() }).where(eq(schema.companies.id, company.id));
}
