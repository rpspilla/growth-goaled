import { Placeholder } from "@/components/Placeholder";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole(["founder"]);
  return <Placeholder title="Who should you really be selling to?" subtitle="ICP analysis based on your closed-won data, benchmark cohort, and GTM profile." milestone="Phase 2" />;
}
