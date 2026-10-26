import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { track } from "@/lib/events";
import { advisoryBookingUrl } from "@/lib/pricing";
import { isUseCaseId } from "@/lib/use-cases";

/** Records the click, then sends the founder to the configured booking page. */
export async function GET(request: NextRequest) {
  const user = await requireRole(["founder"]);
  const url = advisoryBookingUrl();
  if (!url) return NextResponse.redirect(new URL("/advisory", request.url));
  const company = await getFounderCompany(user);
  const useCase = request.nextUrl.searchParams.get("use_case");
  await track("advisory_link_opened", { userId: user.id, companyId: company?.id, props: { use_case: useCase && isUseCaseId(useCase) ? useCase : null } });
  return NextResponse.redirect(url);
}
