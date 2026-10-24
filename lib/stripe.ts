import "server-only";
import Stripe from "stripe";

/** Price of unlocking the preliminary Benchmark, in cents (default $1). */
export const BENCHMARK_PRICE_CENTS = Number(process.env.BENCHMARK_PRICE_CENTS ?? 100) || 100;
export const BENCHMARK_CURRENCY = "usd";

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY?.trim());

let client: Stripe | undefined;

/** Server-side Stripe client (STRIPE_SECRET_KEY). */
export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new Error("STRIPE_SECRET_KEY isn't set.");
    client = new Stripe(key);
  }
  return client;
}

export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
