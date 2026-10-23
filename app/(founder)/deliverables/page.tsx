import { Placeholder } from "@/components/Placeholder";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole(["founder"]);
  return <Placeholder title="Your Deliverables" subtitle="Growth Intelligence outputs for your company." milestone="Phase 2" />;
}
