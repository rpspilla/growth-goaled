import { get } from "@vercel/blob";
import { requireRole } from "@/lib/auth/session";
import { getManagedCompany, listFounderCompanies } from "@/lib/data/companies";
import { projectDocument } from "@/lib/data/projects";

/** Open a file an advisor shared on a growth project: founders of that company, and staff who manage it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["founder", "advisor", "admin"]);
  const doc = await projectDocument((await params).id);
  if (!doc || !doc.blobUrl) return new Response("Not found", { status: 404 });
  const allowed = user.role === "founder" ? (await listFounderCompanies(user)).some((c) => c.id === doc.companyId) : Boolean(await getManagedCompany(user, doc.companyId));
  if (!allowed) return new Response("Not found", { status: 404 });
  const blob = doc.blobUrl.startsWith("e2e://") ? null : await get(doc.blobUrl, { access: "private" }).catch(() => null);
  if (!blob) return new Response("This file is no longer available.", { status: 404 });
  const name = (doc.filename ?? doc.title).replace(/["\\\r\n]/g, "_");
  // PDFs open in the browser; other formats download.
  const inline = doc.mime === "application/pdf";
  return new Response(blob.stream, {
    headers: {
      "Content-Type": doc.mime || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(doc.filename ?? doc.title)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
