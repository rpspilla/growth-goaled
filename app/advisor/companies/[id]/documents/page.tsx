import { DocumentLibrary } from "@/components/documents/DocumentLibrary";
import { companyDocumentLibrary } from "@/lib/data/document-library";
import { fileRows, planRows } from "@/lib/document-rows";
import { companyContext } from "../context";
import { rereadDocumentAction } from "../actions";
import { db, schema } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";

export const metadata = { title: "Documents" };

/** The founder's Documents page, for the advisor: the company's action plans, then every file shared. */
export default async function CompanyDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { company } = await companyContext((await params).id);
  const { plans, files } = await companyDocumentLibrary(company.id);
  // Spreadsheets and CSVs, whose figures are calculated in code: re-read after a fix to how a format is read.
  const sheets = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(and(eq(schema.documents.companyId, company.id), inArray(schema.documents.mime, ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])));
  return (
    <div className="page space-y-6">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl" style={{ color: "var(--foreground)" }}>Documents</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{company.name}&apos;s action plans and everything they&apos;ve shared, as the founder sees it. Select a spreadsheet and press Re-read to read its figures again.</p>
      </header>
      <DocumentLibrary
        plans={planRows(plans, (p) => `/advisor/plans/${p.id}`)}
        files={fileRows(files, null)}
        emptyPlans="No action plans yet."
        reread={{ ids: sheets.map((d) => d.id), action: rereadDocumentAction.bind(null, company.id) }}
      />
    </div>
  );
}
