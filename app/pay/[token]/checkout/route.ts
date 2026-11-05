import { NextResponse, type NextRequest } from "next/server";
import { startLinkCheckout } from "@/lib/data/payment-links";
import { stripeConfigured } from "@/lib/stripe";

/** "Pay" on a payment link: opens Stripe Checkout for the link's amount (anyone with the link can pay it). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  const back = (error: string) => NextResponse.redirect(new URL(`/pay/${encodeURIComponent(token)}?error=${encodeURIComponent(error)}`, request.url), 303);
  if (!stripeConfigured()) return back("Payments aren't set up yet. Please contact your advisor.");
  const r = await startLinkCheckout(token, appUrl).catch((err) => (console.error("[payment-link] Checkout failed", err), { ok: false as const, error: "Checkout couldn't be opened. Please try again." }));
  if (!r.ok) return back(r.error);
  return NextResponse.redirect(r.url, 303);
}
