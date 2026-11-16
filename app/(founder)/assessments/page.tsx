import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";

/** Past growth projects are on Growth Projects (Nov 16, 2026). */
export default async function Page() {
  await requireRole(["founder"]);
  redirect("/projects");
}
