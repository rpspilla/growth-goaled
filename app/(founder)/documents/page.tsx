import { redirect } from "next/navigation";
import { DocumentLibrary } from "@/components/documents/DocumentLibrary";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { companyDocumentLibrary } from "@/lib/data/document-library";
import { fileRows, planRows } from "@/lib/document-rows";

export const metadata = { title: "Documents" };

/** Everything the company has on file: action plans on top, then every file shared. */
export default async function DocumentsPage() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) redirect("/start");
  const { plans, files } = await companyDocumentLibrary(company.id);
  return (
    <div className="page space-y-6">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl" style={{ color: "var(--foreground)" }}>Documents</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>Your action plans and everything you&apos;ve shared with us, in one place.</p>
      </header>
      <DocumentLibrary
        plans={planRows(plans, (p) => `/chat/${p.conversationId}#your-plan`)}
        files={fileRows(files, (id) => `/chat/${id}`)}
        emptyPlans="No action plans yet. When you build one from a conversation, it will be kept here."
      />
    </div>
  );
}
