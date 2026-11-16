import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { activeProjectPath } from "@/lib/project-redirect";

/** Results live inside each growth project now, as approved by the advisor (Nov 16, 2026). */
export default async function Page() {
  await requireRole(["founder"]);
  redirect(await activeProjectPath());
}
