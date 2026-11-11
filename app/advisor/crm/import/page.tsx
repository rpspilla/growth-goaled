import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { CsvImport } from "@/components/crm/CsvImport";
import { importCsvAction } from "../actions";

export const metadata = { title: "Import contacts" };

/** CSV import: headers matched by name; duplicates by email skipped; addresses stay unverified. */
export default async function CrmImportPage() {
  await requireRole(["advisor", "admin"]);
  const muted = { color: "var(--muted-foreground)" };
  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl space-y-5">
      <Link href="/advisor/crm" className="link text-sm">← CRM</Link>
      <h1 className="font-display text-3xl" style={{ color: "var(--foreground)" }}>Import contacts</h1>
      <div className="surface p-5 space-y-4">
        <p className="text-sm" style={muted}>
          The first row should be column names. Recognised: First name, Last name (or Name), Email, Phone, Title, Company, Website, LinkedIn, Location, Category, Source, Notes. Everyone lands in the first column. Anyone whose email is already in the CRM is skipped, never overwritten, and imported email addresses are marked unverified.
        </p>
        <CsvImport run={importCsvAction} />
      </div>
    </div>
  );
}
