import { Placeholder } from "@/components/Placeholder";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole(["founder"]);
  return <Placeholder title="Where should the next dollar go?" subtitle="Channel allocation analysis based on your GTM data and benchmark cohort performance." milestone="Phase 2" />;
}
