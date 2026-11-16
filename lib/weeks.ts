/** Weeks for the advisor's weekly priorities: Monday to Sunday, as YYYY-MM-DD in UTC. */

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const at = (day: string) => Date.parse(`${day}T12:00:00Z`);

/** The Monday on or before a day. */
export function weekStart(day: string): string {
  const t = at(day);
  const dow = new Date(t).getUTCDay(); // 0 = Sunday
  return iso(t - ((dow + 6) % 7) * DAY);
}

export const addDays = (day: string, n: number) => iso(at(day) + n * DAY);

/** "Nov 16 – Nov 22, 2026" for a week's Monday. */
export function weekLabel(monday: string): string {
  const f = (d: string, year = false) => new Date(at(d)).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  return `${f(monday)} – ${f(addDays(monday, 6), true)}`;
}

/** At most this many priorities a week. */
export const MAX_PRIORITIES = 5;
