import { getAuth } from "@/lib/auth/server";
import type { NextRequest } from "next/server";

// Redirects signed-out visitors to /sign-in and refreshes sessions.
// Role checks happen in the layouts and data-access layer, not here.
export default function proxy(request: NextRequest) {
  return getAuth().middleware({ loginUrl: "/sign-in" })(request);
}

export const config = {
  matcher: [
    // Everything except public pages, the auth API, Next internals and static files
    "/((?!sign-in|sign-up|invite|sample|api/auth|auth/callback|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)",
  ],
};
