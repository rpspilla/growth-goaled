import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { homePathFor } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth/session";
import { claimGuest, GUEST_COOKIE } from "@/lib/data/guest";
import { needsOnboarding } from "@/lib/onboarding";

/**
 * Where the sign-in link from the guest chat lands: the chat becomes the founder's company, profile
 * and a saved conversation (only for the email they gave), then opens that conversation.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", request.url));
  const jar = await cookies();
  const claimed = await claimGuest(user, jar.get(GUEST_COOKIE)?.value).catch((err) => (console.error("[guest] Claim failed", err), null));
  if (claimed) {
    jar.delete(GUEST_COOKIE);
    return NextResponse.redirect(new URL(`/chat/${claimed.conversationId}`, request.url));
  }
  return NextResponse.redirect(new URL(needsOnboarding(user) ? "/welcome" : homePathFor(user.role), request.url));
}
