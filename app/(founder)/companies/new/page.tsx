import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { canAddCompanies } from "@/lib/multi-company";
import { AddCompanyForm } from "./AddCompanyForm";

/** Another company profile, for founders allowed more than one. Each company keeps its own data, questions and results. */
export default async function AddCompanyPage() {
  const user = await requireRole(["founder"]);
  if (!canAddCompanies(user.email)) redirect("/overview");
  return (
    <div className="px-4 sm:px-8 py-8 max-w-2xl">
      <Link href="/overview" className="text-sm link">← Back</Link>
      <div className="mt-4">
        <PageHeader title="Add a company" subtitle="Each company has its own profile, data, growth questions and results. Switch between them from the top bar." />
      </div>
      <div className="surface surface-pad">
        <AddCompanyForm />
      </div>
    </div>
  );
}
