import "server-only";
import Stripe from "stripe";
import { e2eEnabled } from "@/lib/e2e";

/**
 * Price of activating one use case, in cents. $1 is a test price until the
 * owner sets real pricing (HANDOFF §13.11); BENCHMARK_PRICE_CENTS overrides it.
 */
export const USE_CASE_PRICE_CENTS = Number(process.env.BENCHMARK_PRICE_CENTS ?? 100) || 100;
export const PRICE_CURRENCY = "usd";

export const stripeConfigured = () => e2eEnabled() || Boolean(process.env.STRIPE_SECRET_KEY?.trim());

let client: Stripe | undefined;

/** Server-side Stripe client (STRIPE_SECRET_KEY). In end-to-end test mode, a fake that "pays" instantly. */
export function stripe(): Stripe {
  if (e2eEnabled()) return fakeStripe as unknown as Stripe;
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new Error("STRIPE_SECRET_KEY isn't set.");
    client = new Stripe(key);
  }
  return client;
}

export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

// End-to-end test mode only: Checkout goes straight to the success URL, and the session reads back as paid.
// Kept on globalThis: next dev bundles server actions and route handlers separately.
const fakeSessions: Map<string, Record<string, unknown>> = ((globalThis as { __ggFakeStripe?: Map<string, Record<string, unknown>> }).__ggFakeStripe ??= new Map());
const fakeStripe = {
  checkout: {
    sessions: {
      async create(params: Stripe.Checkout.SessionCreateParams) {
        const id = `cs_e2e_${crypto.randomUUID()}`;
        const amount = params.line_items?.reduce((n, li) => n + (li.price_data?.unit_amount ?? 0) * (li.quantity ?? 1), 0) ?? 0;
        fakeSessions.set(id, { id, payment_status: "paid", client_reference_id: params.client_reference_id, metadata: params.metadata, amount_total: amount });
        return { id, url: params.success_url?.replace("{CHECKOUT_SESSION_ID}", id) };
      },
      async retrieve(id: string) {
        const session = fakeSessions.get(id);
        if (!session) throw new Error("No such checkout session.");
        return session;
      },
    },
  },
};
