/** Billing cycles and the next billing date they imply (pure, for the contracts page and tests). */
export const BILLING_CYCLES = [
  { id: "monthly", label: "Monthly", months: 1 },
  { id: "quarterly", label: "Quarterly", months: 3 },
  { id: "annual", label: "Annual", months: 12 },
  { id: "one_time", label: "One-time", months: 0 },
] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number]["id"];

export const contractBlobPrefix = (companyId: string) => `contracts/${companyId}/`;

const addMonths = (day: string, months: number) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
};

/**
 * The next date the contract bills on or after `today`: its start, then every cycle after (month
 * ends kept: Jan 31 → Feb 28). One-time contracts bill once, on the start date; nothing after the end.
 */
export function nextBillingDate(start: string | null, cycle: BillingCycle, today: string, end: string | null = null): string | null {
  if (!start) return null;
  const months = BILLING_CYCLES.find((c) => c.id === cycle)!.months;
  let next = start;
  if (months === 0) return start >= today && (!end || start <= end) ? start : null;
  for (let i = 1; next < today && i < 1200; i++) next = addMonths(start, months * i);
  return end && next > end ? null : next;
}
