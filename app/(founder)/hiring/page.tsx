import { Placeholder } from "@/components/Placeholder";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole(["founder"]);
  return <Placeholder title="Who should you hire next?" subtitle="Hiring recommendations based on your constraint analysis and benchmark team composition." milestone="Phase 2" />;
}
