import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";

/** Past growth projects are part of Growth Projects now (Nov 12, 2026); old links land there. */
export default async function AssessmentsPage() {
  await requireRole(["founder"]);
  redirect("/library#past-projects");
}
