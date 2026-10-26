import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { confirmCheckout } from "@/lib/data/payments";
import { stripeConfigured } from "@/lib/stripe";
import { isUseCaseId } from "@/lib/use-cases";
import { USE_CASE_COOKIE } from "@/lib/use-cases/cookie";

/**
 * Stripe Checkout success URL: confirms the session with Stripe (in case the webhook
 * hasn't arrived yet), makes the paid use case the active one, then opens Data.
 */
export async function GET(request: NextRequest) {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const useCase = request.nextUrl.searchParams.get("use_case");
  if (company && sessionId && stripeConfigured()) {
    await confirmCheckout(company, sessionId).catch((err) => console.error("[stripe] Confirming checkout failed", err));
  }
  if (useCase && isUseCaseId(useCase)) {
    (await cookies()).set(USE_CASE_COOKIE, useCase, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return NextResponse.redirect(new URL("/data?checkout=success", request.url));
}
