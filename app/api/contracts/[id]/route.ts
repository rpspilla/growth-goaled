import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { getManagedCompany } from "@/lib/data/companies";

/** Download a signed contract: staff who manage the company only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["advisor", "admin"]);
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [c] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, id)).limit(1);
  if (!c?.blobUrl || !(await getManagedCompany(user, c.companyId))) return new Response("Not found", { status: 404 });
  const blob = await get(c.blobUrl, { access: "private" }).catch(() => null);
  if (!blob) return new Response("This file is no longer available.", { status: 404 });
  const name = (c.filename ?? "contract").replace(/["\\\r\n]/g, "_");
  return new Response(blob.stream, { headers: { "Content-Type": blob.blob.contentType ?? "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
