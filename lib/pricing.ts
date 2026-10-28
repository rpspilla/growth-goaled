import { isComingSoon } from "@/lib/use-cases";
import { isUseCaseId, USE_CASE_IDS, type UseCaseId } from "@/lib/use-cases/types";

/**
 * Offerings and prices (integer cents), configurable by environment so the
 * price shown is always the price charged. Read on the server only.
 *
 * - Growth Snapshot: free.
 * - Single Assessment: one use case, paid once (ASSESSMENT_PRICE_CENTS, default $149).
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
  assessmentCents: cents("ASSESSMENT_PRICE_CENTS", 14_900),
  advisoryFromCents: cents("ADVISORY_PRICE_CENTS", 75_000),
  subscriptionMonthlyCents: cents("SUBSCRIPTION_PRICE_CENTS", 29_900),
  subscriptionAvailable: false as const,
});

export type AdvisoryKind = "review" | "monthly";

/**
 * Booking link for an executive advisor (e.g. a Calendly page); null → founders send a request instead.
 * A monthly call can use its own event (ADVISORY_MONTHLY_BOOKING_URL), else the same link.
 */
export function advisoryBookingUrl(kind: AdvisoryKind = "review"): string | null {
  const pick = (v: string | undefined) => (v?.trim() && /^https:\/\//.test(v.trim()) ? v.trim() : null);
  return (kind === "monthly" ? pick(process.env.ADVISORY_MONTHLY_BOOKING_URL) : null) ?? pick(process.env.ADVISORY_BOOKING_URL);
}

/** Where an advisor call-to-action goes: the booking page (via a tracked redirect) or the request form. */
export const advisoryHref = (useCase: string, kind: AdvisoryKind) =>
  advisoryBookingUrl(kind) ? `/advisory/book?use_case=${useCase}&kind=${kind}` : `/advisory?use_case=${useCase}&kind=${kind}`;

/**
 * Use cases whose full assessment can be bought (all six by default). SELLABLE_USE_CASES,
 * a comma-separated list of ids, narrows it; the rest offer the free Snapshot and "coming soon".
 */
export function sellableUseCases(): UseCaseId[] {
  const raw = process.env.SELLABLE_USE_CASES?.trim() || USE_CASE_IDS.join(",");
  // A "Coming soon" question is never sold, whatever the environment says.
  return raw.split(",").map((s) => s.trim()).filter(isUseCaseId).filter((id) => !isComingSoon(id));
}

export const formatPrice = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
