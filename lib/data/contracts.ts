import "server-only";
import { del, get, head } from "@vercel/blob";
import { readContract, type ContractInput as ReadInput } from "@/lib/ai/contract";
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

/** Turns a file name into a readable title ("Fasten_MSA_v2.pdf" → "Fasten MSA v2"). */
export const titleFromFilename = (name: string) => name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "Contract";

/**
 * A contract dropped onto the company record: saved straight away (named after the file), then read
 * in the background, which fills in its details and key terms.
 */
export async function createContractFromFile(actor: Pick<User, "id">, company: Pick<Company, "id">, file: { pathname: string; filename: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!file.pathname.startsWith(contractBlobPrefix(company.id))) return { ok: false, error: "That file doesn't belong to this company." };
  const blob = await head(file.pathname);
  const [row] = await db
    .insert(schema.contracts)
    .values({ companyId: company.id, title: titleFromFilename(file.filename), status: "draft", blobUrl: blob.url, filename: file.filename.slice(0, 200), mime: blob.contentType, readStatus: "reading", createdBy: actor.id })
    .returning({ id: schema.contracts.id });
  return { ok: true, id: row!.id };
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** Reads an uploaded contract and fills in what it says (run after the upload has been answered). */
export async function readContractFile(contractId: string, opts: { fetchBytes?: (url: string) => Promise<Buffer | null> } = {}): Promise<void> {
  const [c] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, contractId)).limit(1);
  if (!c?.blobUrl) return;
  const fail = (readError: string) => db.update(schema.contracts).set({ readStatus: "failed", readError, updatedAt: new Date() }).where(eq(schema.contracts.id, c.id));
  try {
    const mime = c.mime ?? "";
    let input: ReadInput;
    if (c.blobUrl.startsWith("e2e://")) input = { kind: "text", filename: c.filename ?? "contract", text: "Test contract" };
    else {
      const fetchBytes = opts.fetchBytes ?? (async (url: string) => {
        const r = await get(url, { access: "private" });
        return r ? Buffer.from(await new Response(r.stream).arrayBuffer()) : null;
      });
      if (!(mime === "application/pdf" || (IMAGE_TYPES as readonly string[]).includes(mime) || mime.startsWith("text/"))) {
        await fail("Word and other files aren't read automatically yet. Fill in the details, or upload the signed PDF.");
        return;
      }
      const bytes = await fetchBytes(c.blobUrl);
      if (!bytes) return void (await fail("The file couldn't be found."));
      input =
        mime === "application/pdf"
          ? { kind: "pdf", filename: c.filename ?? "contract.pdf", base64: bytes.toString("base64") }
          : mime.startsWith("text/")
            ? { kind: "text", filename: c.filename ?? "contract.txt", text: bytes.toString("utf8") }
            : { kind: "image", filename: c.filename ?? "contract", base64: bytes.toString("base64"), mediaType: mime as (typeof IMAGE_TYPES)[number] };
    }
    const on = today();
    const r = await readContract(input, on);
    const cycle = r.billingCycle ?? c.billingCycle;
    const status = r.status ?? c.status;
    await db
      .update(schema.contracts)
      .set({
        title: r.title?.trim().slice(0, 200) || c.title,
        status,
        billingCycle: cycle,
        amountCents: r.amount !== null && r.amount >= 0 ? Math.round(r.amount * 100) : c.amountCents,
        startDate: r.startDate ?? c.startDate,
        endDate: r.endDate ?? c.endDate,
        nextBillingDate: status === "ended" ? null : (r.nextBillingDate ?? nextBillingDate(r.startDate ?? c.startDate, cycle, on, r.endDate ?? c.endDate)),
        keyTerms: r.keyTerms?.trim().slice(0, 2000) || null,
        readStatus: "done",
        readError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.contracts.id, c.id));
  } catch (err) {
    console.error("[contracts] read failed", err);
    await fail("The contract couldn't be read automatically. Fill in the details by hand.");
  }
}

/** The advisor corrects or completes a contract's details. */
export async function updateContractDetails(company: Pick<Company, "id">, contractId: string, input: Omit<ContractInput, "pathname" | "filename">): Promise<{ ok: true } | { ok: false; error: string }> {
  const title = input.title.trim().slice(0, 200);
  if (!title) return { ok: false, error: "Give the contract a name." };
  if (input.endDate && input.startDate && input.endDate < input.startDate) return { ok: false, error: "The end date is before the start date." };
  const updated = await db
    .update(schema.contracts)
    .set({
      title,
      status: input.status,
      billingCycle: input.billingCycle,
      amountCents: input.amountCents,
      startDate: input.startDate,
      endDate: input.endDate,
      nextBillingDate: input.status === "ended" ? null : (input.nextBillingDate ?? nextBillingDate(input.startDate, input.billingCycle, today(), input.endDate)),
      notes: input.notes?.trim().slice(0, 2000) || null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.contracts.id, contractId), eq(schema.contracts.companyId, company.id)))
    .returning({ id: schema.contracts.id });
  return updated.length ? { ok: true } : { ok: false, error: "That contract wasn't found." };
}
