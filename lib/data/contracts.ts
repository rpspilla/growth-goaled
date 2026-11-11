import "server-only";
import { del, head } from "@vercel/blob";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, Contract, User } from "@/lib/db/schema";
import { contractBlobPrefix, nextBillingDate, type BillingCycle } from "@/lib/contracts";

export type ContractInput = {
  title: string;
  status: "draft" | "active" | "ended";
  billingCycle: BillingCycle;
  amountCents: number | null;
  startDate: string | null;
  endDate: string | null;
  nextBillingDate: string | null;
  notes: string | null;
  /** Blob pathname of the uploaded signed contract, if any. */
  pathname: string | null;
  filename: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export async function listContracts(companyId: string): Promise<Contract[]> {
  return db.select().from(schema.contracts).where(eq(schema.contracts.companyId, companyId)).orderBy(asc(schema.contracts.status), asc(schema.contracts.nextBillingDate));
}

/** A contract on a company's record. The next billing date is worked out from the cycle when not given. */
export async function createContract(actor: Pick<User, "id">, company: Pick<Company, "id">, input: ContractInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = input.title.trim().slice(0, 200);
  if (!title) return { ok: false, error: "Give the contract a name." };
  if (input.endDate && input.startDate && input.endDate < input.startDate) return { ok: false, error: "The end date is before the start date." };
  let blobUrl: string | null = null;
  if (input.pathname) {
    if (!input.pathname.startsWith(contractBlobPrefix(company.id))) return { ok: false, error: "That file doesn't belong to this company." };
    blobUrl = (await head(input.pathname)).url;
  }
  const [row] = await db
    .insert(schema.contracts)
    .values({
      companyId: company.id,
      title,
      status: input.status,
      billingCycle: input.billingCycle,
      amountCents: input.amountCents,
      startDate: input.startDate,
      endDate: input.endDate,
      nextBillingDate: input.status === "ended" ? null : (input.nextBillingDate ?? nextBillingDate(input.startDate, input.billingCycle, today(), input.endDate)),
      blobUrl,
      filename: blobUrl ? (input.filename?.slice(0, 200) ?? "contract") : null,
      notes: input.notes?.trim().slice(0, 2000) || null,
      createdBy: actor.id,
    })
    .returning({ id: schema.contracts.id });
  return { ok: true, id: row!.id };
}

/** Moves a contract on: marks it billed (next date rolls forward a cycle), active again, or ended. */
export async function updateContract(company: Pick<Company, "id">, contractId: string, change: { status?: "draft" | "active" | "ended"; billed?: boolean }): Promise<boolean> {
  const [c] = await db.select().from(schema.contracts).where(and(eq(schema.contracts.id, contractId), eq(schema.contracts.companyId, company.id))).limit(1);
  if (!c) return false;
  const set: Partial<typeof schema.contracts.$inferInsert> = { updatedAt: new Date() };
  if (change.status) {
    set.status = change.status;
    if (change.status === "ended") set.nextBillingDate = null;
    if (change.status === "active" && !c.nextBillingDate) set.nextBillingDate = nextBillingDate(c.startDate, c.billingCycle, today(), c.endDate);
  }
  if (change.billed && c.nextBillingDate) {
    const after = new Date(Date.parse(`${c.nextBillingDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    set.nextBillingDate = nextBillingDate(c.startDate ?? c.nextBillingDate, c.billingCycle, after, c.endDate);
  }
  await db.update(schema.contracts).set(set).where(eq(schema.contracts.id, c.id));
  return true;
}

export async function removeContract(company: Pick<Company, "id">, contractId: string): Promise<boolean> {
  const [c] = await db.delete(schema.contracts).where(and(eq(schema.contracts.id, contractId), eq(schema.contracts.companyId, company.id))).returning();
  if (c?.blobUrl) await del(c.blobUrl).catch(() => null);
  return Boolean(c);
}

export async function contractFor(company: Pick<Company, "id">, contractId: string): Promise<Contract | null> {
  const [c] = await db.select().from(schema.contracts).where(and(eq(schema.contracts.id, contractId), eq(schema.contracts.companyId, company.id))).limit(1);
  return c ?? null;
}
