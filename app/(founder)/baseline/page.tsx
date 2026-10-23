import { Placeholder } from "@/components/Placeholder";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole(["founder"]);
  return <Placeholder title="Your GTM Baseline" subtitle="Three major findings from your Growth Intelligence analysis." milestone="Phase 2" />;
}
