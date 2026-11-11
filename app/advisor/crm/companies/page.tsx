import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { CompanyForm } from "@/components/crm/CompanyForm";
import { listCompanies } from "@/lib/data/crm";
import { saveCompanyAction } from "../actions";

export const metadata = { title: "CRM companies" };

/** Prospect companies, each with the contacts at it. */
export default async function CrmCompaniesPage() {
  await requireRole(["advisor", "admin"]);
  const companies = await listCompanies();
  const muted = { color: "var(--muted-foreground)" };
  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl space-y-5">
      <Link href="/advisor/crm" className="link text-sm">← CRM</Link>
      <h1 className="font-display text-3xl" style={{ color: "var(--foreground)" }}>Companies</h1>
      <ul aria-label="Companies" className="surface divide-y">
        {companies.map((c) => (
          <li key={c.id} style={{ borderColor: "var(--border)" }}>
            <Link href={`/advisor/crm/companies/${c.id}`} className="flex gap-4 items-center p-4 hover:bg-[var(--muted)] rounded-xl">
              <span className="flex-1 font-semibold" style={{ color: "var(--foreground)" }}>{c.name}</span>
              <span className="text-sm" style={muted}>{[c.domain, c.stage, c.industry].filter(Boolean).join(" · ")}</span>
              <span className="text-sm" style={muted}>{c.contacts} {c.contacts === 1 ? "contact" : "contacts"}</span>
            </Link>
          </li>
        ))}
        {!companies.length && <li className="p-4 text-sm" style={muted}>No companies yet. They&apos;re created when you add a contact with a company, or here.</li>}
      </ul>
      <section className="surface p-5 space-y-3">
        <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>Add a company</h2>
        <CompanyForm isNew save={saveCompanyAction.bind(null, null)} values={{ name: "", website: "", industry: "", stage: "", estimatedArr: "", employeeCount: "", description: "", keyNotes: "" }} />
      </section>
    </div>
  );
}
