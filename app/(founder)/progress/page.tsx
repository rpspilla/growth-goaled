import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { activeProjectPath } from "@/lib/project-redirect";

/** The action plan lives inside each growth project now, as the advisor's document (Nov 16, 2026). */
export default async function Page() {
  await requireRole(["founder"]);
  redirect(await activeProjectPath());
}
