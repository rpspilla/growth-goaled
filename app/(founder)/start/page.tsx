import { redirect } from "next/navigation";
import { founderContext } from "@/lib/data/founder-context";

/** Where a founder lands after signing in: the Overview, their dashboard (Founder View redesign). */
export default async function StartPage() {
  await founderContext();
  redirect("/overview");
}
