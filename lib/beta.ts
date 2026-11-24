import { e2eEnabled } from "@/lib/e2e";

/**
 * Rally Beta (Nov 24, 2026): while on, founders see no prices, plan offers, upgrade or paid-service
 * prompts, and the AI never suggests a paid plan. Billing, Stripe, plans and every staff tool keep
 * working, so pricing can return by setting RALLY_BETA=off without a rebuild.
 */
const g = globalThis as { __rallyBetaOffForE2e?: boolean };

export const isBeta = () => !(e2eEnabled() && g.__rallyBetaOffForE2e) && process.env.RALLY_BETA !== "off";

/** End-to-end tests only (lib/e2e): run the paid journey (action plans) as it will be after the Beta. */
export function setBetaOffForE2e(off: boolean): boolean {
  if (!e2eEnabled()) return false;
  g.__rallyBetaOffForE2e = off;
  return true;
}
