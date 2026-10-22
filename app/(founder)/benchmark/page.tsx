import { Placeholder } from "@/components/Placeholder";
import { BenchmarkView } from "@/components/views/BenchmarkView";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { getDashboard } from "@/lib/data/dashboard";

export default async function BenchmarkPage() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  // getDashboard only returns a *published* benchmark, so founders never see drafts.
  const data = company ? await getDashboard(company) : null;
  if (!company || !data?.benchmark) {
    return (
      <Placeholder
        title="How do you compare?"
        subtitle="Your benchmark appears here once your advisor has reviewed and published it."
        milestone="M8"
      />
    );
  }
  return <BenchmarkView data={data.benchmark} companyName={company.name} scoreBreakdown={data.scoreBreakdown} />;
}
