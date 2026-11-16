import { DocumentLibrary } from "@/components/documents/DocumentLibrary";
import { companyDocumentLibrary } from "@/lib/data/document-library";
import { fileRows, planRows } from "@/lib/document-rows";
import { companyContext } from "../context";
import { rereadDocumentAction } from "../actions";
import { db, schema } from "@/lib/db";
import { and, desc, eq, inArray } from "drizzle-orm";

export const metadata = { title: "Documents" };

/** The founder's Documents page, for the advisor: the company's action plans, then every file shared. */
export default async function CompanyDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { company } = await companyContext((await params).id);
  const { plans, files } = await companyDocumentLibrary(company.id);
  // Spreadsheets and CSVs, whose figures are calculated in code: re-read after a fix to how a format is read.
  const sheets = await db
    .select({ id: schema.documents.id, filename: schema.documents.filename, status: schema.documents.status, updatedAt: schema.documents.updatedAt })
    .from(schema.documents)
    .where(and(eq(schema.documents.companyId, company.id), inArray(schema.documents.mime, ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])))
    .orderBy(desc(schema.documents.updatedAt));
  return (
    <div className="page space-y-6">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl" style={{ color: "var(--foreground)" }}>Documents</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{company.name}&apos;s action plans and everything they&apos;ve shared, as the founder sees it.</p>
      </header>
      <DocumentLibrary plans={planRows(plans, (p) => `/advisor/plans/${p.id}`)} files={fileRows(files, null)} emptyPlans="No action plans yet." />
      {sheets.length > 0 && (
        <section aria-label="Re-read spreadsheets" className="surface p-5 space-y-2">
          <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>Re-read a spreadsheet</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Reads the file again and replaces the figures it proposed (confirmed figures stay).</p>
          <ul className="divide-y text-sm" style={{ borderColor: "var(--border)" }}>
            {sheets.map((d) => (
              <li key={d.id} className="py-2 flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--border)" }}>
                <span className="flex-1 min-w-[12rem]" style={{ color: "var(--foreground)" }}>{d.filename}</span>
                <span style={{ color: "var(--muted-foreground)" }}>{d.status === "analyzing" ? "Reading…" : d.status}</span>
                <form action={rereadDocumentAction.bind(null, company.id, d.id)}>
                  <button type="submit" className="link" aria-label={`Re-read ${d.filename}`} disabled={d.status === "analyzing"}>Re-read</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
