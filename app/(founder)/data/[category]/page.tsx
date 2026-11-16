import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";

/** Data is one shared page now (Nov 16, 2026). */
export default async function Page() {
  await requireRole(["founder"]);
  redirect("/data");
}
