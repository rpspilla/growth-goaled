import { notFound } from "next/navigation";
import { getDashboard, getSampleCompany } from "@/lib/data/dashboard";
import { DashboardView } from "@/components/views/DashboardView";
import { sampleHref } from "./paths";

export default async function SampleDashboardPage() {
  const company = await getSampleCompany();
  if (!company) notFound();
  return <DashboardView data={await getDashboard(company)} hrefFor={sampleHref} />;
}
