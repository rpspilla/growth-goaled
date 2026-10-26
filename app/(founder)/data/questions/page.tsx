import { PageHeader } from "@/components/PageHeader";
import { ReadinessTabs } from "@/components/readiness/ReadinessTabs";
import { QuestionsView } from "@/components/registers/QuestionsView";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { listCompanyFiles, listRegisterItems } from "@/lib/data/registers";
import { resolveQuestion } from "./actions";

export default async function QuestionsPage() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  const header = <PageHeader eyebrow="Step 3 · Data" title="Needs your answer" subtitle="Resolving these will improve the accuracy of your Growth Intelligence profile." />;
  if (!company) return <div className="p-8 max-w-4xl">{header}</div>;

  const [items, files] = await Promise.all([listRegisterItems([company.id], { owner: "founder" }), listCompanyFiles(company)]);
  return (
    <div className="p-8 max-w-6xl">
      {header}
      <ReadinessTabs missingByCategory={{}} />
      <QuestionsView items={items} files={files} resolve={resolveQuestion} />
    </div>
  );
}
