import { NextResponse } from "next/server";
import { recordPaidSession } from "@/lib/data/payments";
import { stripe } from "@/lib/stripe";

/**
 * Stripe webhook: unlocks the Benchmark when a Checkout completes. The
 * signature is verified with STRIPE_WEBHOOK_SECRET; nothing is trusted otherwise.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Not configured" }, { status: 400 });
  let event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    await recordPaidSession(event.data.object);
  }
  return NextResponse.json({ received: true });
}
