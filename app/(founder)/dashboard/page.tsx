import { PageHeader } from "@/components/PageHeader";
import { DashboardView } from "@/components/views/DashboardView";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { getDashboard } from "@/lib/data/dashboard";

export default async function DashboardPage() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) {
    return (
      <div className="p-8 max-w-4xl">
        <PageHeader title="Welcome" subtitle="Your company isn't set up yet. Contact your advisor if this persists." />
      </div>
    );
  }
  return <DashboardView data={await getDashboard(company)} hrefFor={(path) => path} />;
}
