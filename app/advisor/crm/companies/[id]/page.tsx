import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { CompanyForm } from "@/components/crm/CompanyForm";
import { QuickAdd } from "@/components/crm/QuickAdd";
import { fullName } from "@/lib/crm";
import { getCompany, listCompanies, pipeline } from "@/lib/data/crm";
import { companyChats } from "@/lib/data/guest";
import { LeadChats, QuestionCounts } from "@/components/crm/LeadChats";
import { addContactAction, saveCompanyAction } from "../../actions";

export const metadata = { title: "CRM company" };

/** One prospect company: its profile and every contact there. */
export default async function CrmCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["advisor", "admin"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [data, { stages }, companies, chat] = await Promise.all([getCompany(id), pipeline(), listCompanies(), companyChats(id)]);
  if (!data) notFound();
  const { company: co, contacts } = data;
  const muted = { color: "var(--muted-foreground)" };
  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl space-y-5">
      <Link href="/advisor/crm/companies" className="link text-sm">← Companies</Link>
      <h1 className="font-display text-3xl" style={{ color: "var(--foreground)" }}>{co.name}</h1>
      <section aria-label="Contacts at this company" className="surface p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>Contacts ({contacts.length})</h2>
          <QuickAdd defaultCompany={co.name} add={addContactAction} companies={companies.map((c) => ({ id: c.id, name: c.name }))} stages={stages.map((s) => ({ id: s.id, name: s.name }))} />
        </div>
        <ul className="divide-y text-sm">
          {contacts.map((c) => (
            <li key={c.id} className="py-2 flex gap-3" style={{ borderColor: "var(--border)" }}>
              <Link href={`/advisor/crm/contacts/${c.id}`} className="link font-medium">{fullName(c)}</Link>
              <span style={muted}>{[c.jobTitle, c.email, stages.find((s) => s.id === c.stageId)?.name].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
          {!contacts.length && <li className="py-2" style={muted}>No contacts yet. Add one with this company&apos;s name.</li>}
        </ul>
      </section>
      <section aria-label="Website chat" className="surface p-5 space-y-4">
        <h2 className="font-semibold" style={{ color: "var(--foreground)" }}>Website chat</h2>
        <QuestionCounts {...chat} />
        <LeadChats chats={chat.chats} names={Object.fromEntries(contacts.map((c) => [c.id, fullName(c)]))} />
      </section>
      <section className="surface p-5">
        <CompanyForm
          save={saveCompanyAction.bind(null, co.id)}
          values={{ name: co.name, website: co.website ?? "", industry: co.industry ?? "", stage: co.stage ?? "", estimatedArr: co.estimatedArrCents === null ? "" : String(co.estimatedArrCents / 100), employeeCount: co.employeeCount === null ? "" : String(co.employeeCount), description: co.description ?? "", keyNotes: co.keyNotes ?? "" }}
        />
      </section>
    </div>
  );
}
