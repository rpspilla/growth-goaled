import { isUseCaseId, type UseCaseId } from "@/lib/use-cases/types";

/**
 * Offerings and prices (integer cents), configurable by environment so the
 * price shown is always the price charged. Read on the server only.
 *
 * - Growth Snapshot: free.
 * - Single Assessment: one use case, paid once (ASSESSMENT_PRICE_CENTS, default $499).
 * - Advisory Session: optional, from ADVISORY_PRICE_CENTS (default $750); booked through
 *   ADVISORY_BOOKING_URL when set, otherwise as a request to the team.
 * - Growth Intelligence subscription: reserved (SUBSCRIPTION_PRICE_CENTS, $299/month). Not
 *   sold or shown until its features exist; there is no recurring billing.
 */
const cents = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const CURRENCY = "usd";

export const pricing = () => ({
  assessmentCents: cents("ASSESSMENT_PRICE_CENTS", 49_900),
  advisoryFromCents: cents("ADVISORY_PRICE_CENTS", 75_000),
  subscriptionMonthlyCents: cents("SUBSCRIPTION_PRICE_CENTS", 29_900),
  subscriptionAvailable: false as const,
});

/** Booking link for advisory sessions (e.g. a Calendly page); null → founders send a request instead. */
export function advisoryBookingUrl(): string | null {
  const url = process.env.ADVISORY_BOOKING_URL?.trim();
  return url && /^https:\/\//.test(url) ? url : null;
}

/**
 * Use cases whose full assessment can be bought today. Only those with a working analysis
 * pipeline should be listed; the others offer the free Snapshot and show "coming soon".
 * SELLABLE_USE_CASES is a comma-separated list of ids (default: growth_leak).
 */
export function sellableUseCases(): UseCaseId[] {
  const raw = process.env.SELLABLE_USE_CASES ?? "growth_leak";
  return raw.split(",").map((s) => s.trim()).filter(isUseCaseId);
}

export const formatPrice = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
