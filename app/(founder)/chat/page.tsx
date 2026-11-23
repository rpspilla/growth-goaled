import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { WHATS_NEXT } from "@/lib/nav";

/** "Strategic Growth Questions" is now Ask your CRO (at /whats-next); old links land there. Conversations stay at /chat/[id]. */
export default async function ChatIndexPage() {
  await requireRole(["founder"]);
  redirect(WHATS_NEXT);
}
