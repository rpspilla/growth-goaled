import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";

/** Category tabs were folded into the use case's own list on /data. */
export default async function CategoryPage() {
  await requireRole(["founder"]);
  redirect("/data");
}
