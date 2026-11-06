import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { billingPortalUrl } from "@/lib/data/billing";
import { getFounderCompany } from "@/lib/data/companies";
import { track } from "@/lib/events";
import { safeNextPath } from "@/lib/invites";
import { stripeConfigured } from "@/lib/stripe";

/** "Manage billing": sends the founder to Stripe's billing portal for their subscription, then back. */
export async function GET(request: NextRequest) {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  const back = safeNextPath(request.nextUrl.searchParams.get("return"));
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  const fail = (msg: string) => NextResponse.redirect(new URL(`${back}${back.includes("?") ? "&" : "?"}billing_error=${encodeURIComponent(msg)}`, request.url));
  if (!company || !stripeConfigured()) return fail("Billing isn't available right now.");
  const r = await billingPortalUrl(company, `${appUrl}${back}`).catch((err) => (console.error("[billing] Portal failed", err), { ok: false as const, error: "Billing couldn't be opened. Please try again, or email us." }));
  if (!r.ok) return fail(r.error);
  await track("billing_portal_opened", { userId: user.id, companyId: company.id, props: {} });
  return NextResponse.redirect(r.url);
}
