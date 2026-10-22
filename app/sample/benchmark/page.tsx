import { notFound } from "next/navigation";
import { getDashboard, getSampleCompany } from "@/lib/data/dashboard";
import { BenchmarkView } from "@/components/views/BenchmarkView";

export default async function SampleBenchmarkPage() {
  const company = await getSampleCompany();
  if (!company) notFound();
  const data = await getDashboard(company);
  if (!data.benchmark) notFound();
  return <BenchmarkView data={data.benchmark} companyName={company.name} scoreBreakdown={data.scoreBreakdown} />;
}
