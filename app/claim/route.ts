import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { homePathFor } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { claimGuest, GUEST_COOKIE } from "@/lib/data/guest";
import { needsOnboarding } from "@/lib/onboarding";

/**
 * Where the sign-in link from the guest chat lands: the chat becomes the founder's company, profile
 * and a saved conversation (only for the email they gave), then opens that conversation, where their
 * AI CRO carries on (at the plan offer when they asked for an action plan: ?plan=1). "Diagnose my
 * growth" (?to=library) lands there too now; the old library page is retired.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", request.url));
  const jar = await cookies();
  const claimed = await claimGuest(user, jar.get(GUEST_COOKIE)?.value).catch((err) => (console.error("[guest] Claim failed", err), null));
  if (claimed) {
    jar.delete(GUEST_COOKIE);
    // From "Get a CRO-built GTM action plan": open straight at the plan offer.
    const anchor = request.nextUrl.searchParams.get("plan") === "1" ? "#build-plan" : "";
    return NextResponse.redirect(new URL(`/chat/${claimed.conversationId}${anchor}`, request.url));
  }
  if (request.nextUrl.searchParams.get("to") === "library" && !needsOnboarding(user) && user.role === "founder") return NextResponse.redirect(new URL("/overview", request.url));
  // ?claimed=0 stops /welcome sending them straight back here.
  const setUp = needsOnboarding(user) || (user.role === "founder" && !(await getFounderCompany(user)));
  return NextResponse.redirect(new URL(setUp ? "/welcome?claimed=0" : homePathFor(user.role), request.url));
}
