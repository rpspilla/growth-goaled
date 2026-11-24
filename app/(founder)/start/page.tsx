import { redirect } from "next/navigation";
import { founderContext } from "@/lib/data/founder-context";

/** Where a founder lands after signing in: Rally, the conversation (Rally Beta, Nov 24, 2026). */
export default async function StartPage() {
  await founderContext();
  redirect("/whats-next");
}
