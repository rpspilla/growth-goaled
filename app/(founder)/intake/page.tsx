import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { getIntakeAnswers } from "@/lib/data/intake";
import { firstIncompleteSection } from "@/lib/intake";

/** Resume where the founder left off. */
export default async function IntakeIndex() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  const next = company ? firstIncompleteSection(await getIntakeAnswers(company)) : null;
  redirect(`/intake/${next ?? "company"}`);
}
