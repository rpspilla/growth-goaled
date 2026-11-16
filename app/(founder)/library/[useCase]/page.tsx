import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";

/** Founders no longer pick growth projects (Nov 16, 2026); old links land on Growth Projects. */
export default async function Page() {
  await requireRole(["founder"]);
  redirect("/projects");
}
