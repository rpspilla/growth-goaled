import { ProcessingView } from "@/components/deliverables/ProcessingView";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { founderBenchmarkStatus } from "@/lib/data/deliverables";

export default async function ProcessingPage() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  const status = company ? await founderBenchmarkStatus(company.id) : { status: "none" as const, hasPublished: false };
  return <ProcessingView status={status.status} hasPublished={status.hasPublished} />;
}
