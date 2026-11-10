import { get } from "@vercel/blob";
import { requireRole } from "@/lib/auth/session";
import { documentForUser } from "@/lib/data/document-library";

/** Download one uploaded file: founders get their company's, advisors the companies they manage. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["founder", "advisor", "admin"]);
  const doc = await documentForUser(user, (await params).id);
  if (!doc) return new Response("Not found", { status: 404 });
  const blob = doc.blobUrl.startsWith("e2e://") ? null : await get(doc.blobUrl, { access: "private" }).catch(() => null);
  if (!blob) return new Response("This file is no longer available.", { status: 404 });
  const name = doc.filename.replace(/["\\\r\n]/g, "_");
  return new Response(blob.stream, {
    headers: {
      "Content-Type": doc.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
