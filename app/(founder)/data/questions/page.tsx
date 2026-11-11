import { PageHeader } from "@/components/PageHeader";
import { DataTopPanel } from "@/components/readiness/DataTopPanel";
import { ReadinessTabs } from "@/components/readiness/ReadinessTabs";
import { QuestionsView } from "@/components/registers/QuestionsView";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { listCompanyFiles, listRegisterItems } from "@/lib/data/registers";
import { resolveQuestion } from "./actions";

export default async function QuestionsPage() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  const header = <PageHeader title="Review with your advisor" subtitle="Questions about your data to go through with your advisor. Settling them makes your results more accurate." />;
  if (!company) return <div className="px-4 sm:px-8 py-8 max-w-4xl">{header}</div>;

  const [items, files] = await Promise.all([listRegisterItems([company.id], { owner: "founder" }), listCompanyFiles(company)]);
  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl">
      {header}
      <DataTopPanel />
      <ReadinessTabs questions={items.length} />
      <QuestionsView items={items} files={files} resolve={resolveQuestion} />
    </div>
  );
}
