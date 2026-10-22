import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { companyBlobPrefix, listDocuments } from "@/lib/data/documents";
import { UploadPanel } from "./UploadPanel";

// Extraction runs after the upload action responds (next/server after()), within this budget.
export const maxDuration = 300;

export default async function UploadPage() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) {
    return (
      <div className="p-8 max-w-3xl">
        <PageHeader title="Bring your existing data." subtitle="Your company isn't set up yet." />
      </div>
    );
  }
  const documents = await listDocuments(company);
  return <UploadPanel blobPrefix={companyBlobPrefix(company.id)} documents={documents} />;
}
