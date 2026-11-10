import { DocumentLibrary } from "@/components/documents/DocumentLibrary";
import { companyDocumentLibrary } from "@/lib/data/document-library";
import { fileRows, planRows } from "@/lib/document-rows";
import { companyContext } from "../context";

export const metadata = { title: "Documents" };

/** The founder's Documents page, for the advisor: the company's action plans, then every file shared. */
export default async function CompanyDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { company } = await companyContext((await params).id);
  const { plans, files } = await companyDocumentLibrary(company.id);
  return (
    <div className="px-4 sm:px-8 py-8 max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl" style={{ color: "var(--foreground)" }}>Documents</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{company.name}&apos;s action plans and everything they&apos;ve shared, as the founder sees it.</p>
      </header>
      <DocumentLibrary plans={planRows(plans, (p) => `/advisor/plans/${p.id}`)} files={fileRows(files, null)} emptyPlans="No action plans yet." />
    </div>
  );
}
