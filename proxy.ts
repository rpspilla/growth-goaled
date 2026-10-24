import { getAuth } from "@/lib/auth/server";
import { NextResponse, type NextRequest } from "next/server";
import { E2E_COOKIE, e2eEnabled } from "@/lib/e2e";

// Redirects signed-out visitors to /sign-in and refreshes sessions.
// Role checks happen in the layouts and data-access layer, not here.
export default function proxy(request: NextRequest) {
  if (e2eEnabled()) {
    return request.cookies.get(E2E_COOKIE) ? NextResponse.next() : NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return getAuth().middleware({ loginUrl: "/sign-in" })(request);
}

export const config = {
  matcher: [
    // Everything except public pages, the auth API, Next internals and static files
    "/((?!sign-in|sign-up|invite|sample|api/auth|api/stripe/webhook|auth/callback|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)",
  ],
};
