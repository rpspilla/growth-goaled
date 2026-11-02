import { after, NextResponse } from "next/server";
import { cancelSupportedPlan, writePlan } from "@/lib/data/action-plans";
import { markSession, recordPaidSession } from "@/lib/data/payments";
import { stripe } from "@/lib/stripe";

/**
 * Stripe webhook: grants a purchased assessment or starts an action plan when its Checkout is
 * paid, ends a supported plan when its subscription ends, and records expired or failed sessions. The signature is verified with STRIPE_WEBHOOK_SECRET;
 * nothing is trusted otherwise. Handlers are idempotent (Stripe may retry).
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
    const session = event.data.object;
    await recordPaidSession(session);
    // A supported plan's first draft is written as soon as it's paid (no-op for anything else).
    const planId = session.metadata?.actionPlanId;
    if (planId && session.metadata?.purpose === "action_plan_supported") after(() => writePlan(planId, { onlyIfEmpty: true }));
  } else if (event.type === "customer.subscription.deleted" || (event.type === "customer.subscription.updated" && ["canceled", "unpaid", "incomplete_expired"].includes(event.data.object.status))) {
    await cancelSupportedPlan(event.data.object.id);
  } else if (event.type === "checkout.session.expired") {
    await markSession(event.data.object.id, "expired");
  } else if (event.type === "checkout.session.async_payment_failed") {
    await markSession(event.data.object.id, "failed");
  }
  return NextResponse.json({ received: true });
}
