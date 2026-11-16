import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";

/** Founders no longer pick growth projects (Founder View redesign, Nov 16, 2026): the advisor runs them, listed on Growth Projects. */
export default async function Page() {
  await requireRole(["founder"]);
  redirect("/projects");
}
