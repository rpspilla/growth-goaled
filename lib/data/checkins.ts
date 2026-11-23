import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Commitment, Company } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { addDays } from "@/lib/weeks";
import { companyCommitments } from "./commitments";
import { today } from "./projects";
import { unsubscribeToken } from "./reminders";

/**
 * The weekly check-in (Nov 24, 2026): every Monday, founders with commitments due this week, overdue,
 * or done without saying how it went get one email; it opens the check-in page, where they tick them
 * off, move dates, record outcomes and talk it through with their CRO.
 */

/** Sent at most once per company in this many days. */
export const CHECKIN_EVERY_DAYS = 6;
const DAY = 86_400_000;

export type CheckinItems = { overdue: Commitment[]; dueThisWeek: Commitment[]; needsOutcome: Commitment[] };

/** What a check-in covers: open commitments overdue or due in the next 7 days, and ones closed in the last 14 days without an outcome. */
export async function checkinItems(company: Pick<Company, "id">, on = today()): Promise<CheckinItems> {
  const all = await companyCommitments(company);
  const weekEnd = addDays(on, 6);
  const since = Date.parse(`${addDays(on, -14)}T00:00:00Z`);
  return {
    overdue: all.filter((c) => c.status === "open" && c.dueOn !== null && c.dueOn < on),
    dueThisWeek: all.filter((c) => c.status === "open" && c.dueOn !== null && c.dueOn >= on && c.dueOn <= weekEnd),
    needsOutcome: all.filter((c) => c.status === "done" && !c.outcome && (c.closedAt?.getTime() ?? 0) >= since),
  };
}

export const checkinCount = (i: CheckinItems) => i.overdue.length + i.dueThisWeek.length + i.needsOutcome.length;

/** The founder's opening words for a check-in conversation, from where their commitments stand. */
export function checkinMessage(i: CheckinItems, recent: Pick<Commitment, "title" | "status" | "outcome" | "outcomeNote">[]): string {
  const outcome = { worked: "worked", partly: "partly worked", didnt: "didn't work" } as const;
  const lines = [
    "Weekly check-in.",
    ...recent.map((c) => `- ${c.status === "done" ? "Done" : "Dropped"}: ${c.title}${c.outcome ? ` (${outcome[c.outcome]}${c.outcomeNote ? `: ${c.outcomeNote}` : ""})` : ""}`),
    ...i.overdue.map((c) => `- Overdue: ${c.title}`),
    ...i.dueThisWeek.map((c) => `- Due this week: ${c.title}`),
    "What should I focus on this week?",
  ];
  return lines.join("\n");
}

export type DueCheckin = { company: Company; items: CheckinItems; to: { userId: string; email: string; name: string | null }[] };

/** Companies due a check-in email now: something to check in on, nothing sent in the last 6 days, founders who haven't opted out. */
export async function dueCheckins(now = new Date()): Promise<DueCheckin[]> {
  const open = await db.selectDistinct({ companyId: schema.commitments.companyId }).from(schema.commitments);
  const ids = open.map((o) => o.companyId);
  if (!ids.length) return [];
  const [companies, members, sent, unsubscribed] = await Promise.all([
    db.select().from(schema.companies).where(inArray(schema.companies.id, ids)),
    db
      .select({ companyId: schema.companyMembers.companyId, userId: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role })
      .from(schema.companyMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
      .where(inArray(schema.companyMembers.companyId, ids)),
    db
      .select({ companyId: schema.events.companyId })
      .from(schema.events)
      .where(and(eq(schema.events.name, "weekly_checkin_sent"), inArray(schema.events.companyId, ids), gte(schema.events.createdAt, new Date(now.getTime() - CHECKIN_EVERY_DAYS * DAY)))),
    db.select({ userId: schema.events.userId }).from(schema.events).where(eq(schema.events.name, "weekly_checkin_unsubscribed")),
  ]);
  const recent = new Set(sent.map((s) => s.companyId));
  const optedOut = new Set(unsubscribed.map((u) => u.userId));
  const on = now.toISOString().slice(0, 10);
  const out: DueCheckin[] = [];
  for (const company of companies) {
    if (company.isSample || recent.has(company.id)) continue;
    const items = await checkinItems(company, on);
    if (!checkinCount(items)) continue;
    const to = members.filter((m) => m.companyId === company.id && m.role === "founder" && !optedOut.has(m.userId)).map(({ userId, email, name }) => ({ userId, email, name }));
    if (to.length) out.push({ company, items, to });
  }
  return out;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** The check-in email for one founder: what's overdue, what's due this week, what needs an outcome. */
export function checkinEmail(p: { company: Pick<Company, "name">; items: CheckinItems; appUrl: string; unsubscribeUrl: string; name: string | null }) {
  const { overdue, dueThisWeek, needsOutcome } = p.items;
  const first = p.name?.split(" ")[0];
  const subject = overdue.length ? `${p.company.name}: ${overdue.length} commitment${overdue.length === 1 ? "" : "s"} slipped. 2-minute check-in` : `${p.company.name}: your weekly check-in`;
  const groups: [string, Commitment[], (c: Commitment) => string][] = [
    ["Overdue", overdue, (c) => `was due ${dayLabel(c.dueOn!)}`],
    ["Due this week", dueThisWeek, (c) => `by ${dayLabel(c.dueOn!)}`],
    ["Done: how did it go?", needsOutcome, () => "tell your CRO what happened"],
  ];
  const url = `${p.appUrl}/checkin`;
  const text = `${first ? `Hi ${first},\n\n` : ""}Here's where your commitments stand this week.

${groups
  .filter(([, list]) => list.length)
  .map(([title, list, when]) => `${title}:\n${list.map((c) => `- ${c.title} (${c.owner}, ${when(c)})`).join("\n")}`)
  .join("\n\n")}

Tick them off, move dates or say how it went, then talk the week through with your CRO: ${url}

Stop these weekly emails: ${p.unsubscribeUrl}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:520px">
${first ? `<p style="font-size:15px">Hi ${escape(first)},</p>` : ""}
<p style="font-size:15px">Here's where your commitments stand this week.</p>
${groups
  .filter(([, list]) => list.length)
  .map(
    ([title, list, when]) =>
      `<p style="font-size:14px;font-weight:600;margin:16px 0 4px;color:${title === "Overdue" ? "#B91C1C" : "#0D1B2A"}">${escape(title)}</p><ul style="font-size:14px;margin:0;padding-left:18px">${list.map((c) => `<li style="margin:4px 0">${escape(c.title)} <span style="color:#5F6B7C">(${escape(c.owner)}, ${escape(when(c))})</span></li>`).join("")}</ul>`,
  )
  .join("")}
<p style="margin-top:20px"><a href="${escape(url)}" style="display:inline-block;background:#155A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Do your check-in</a></p>
<p style="font-size:12px;color:#5F6B7C">Tick them off, move dates, say how it went, then talk the week through with your CRO.<br><a href="${escape(p.unsubscribeUrl)}" style="color:#5F6B7C">Stop these weekly emails</a></p>
</div>`;
  return { subject, text, html };
}

/** Sends every check-in that's due (the weekly cron). Recorded once per company, sent or not, so a failing mailer can't retry daily. */
export async function sendWeeklyCheckins(now = new Date()): Promise<{ due: number; sent: number; failed: string[] }> {
  const appUrl = (process.env.APP_URL ?? "https://app.growthgoaled.com").replace(/\/$/, "");
  const due = await dueCheckins(now);
  let sent = 0;
  const failed: string[] = [];
  for (const d of due) {
    for (const to of d.to) {
      const unsubscribeUrl = `${appUrl}/api/email/unsubscribe?k=weekly&u=${to.userId}&t=${unsubscribeToken(to.userId, "weekly-checkin")}`;
      const result = await sendEmail({ to: to.email, ...checkinEmail({ company: d.company, items: d.items, appUrl, unsubscribeUrl, name: to.name }) });
      if (result.sent) sent++;
      else failed.push(`${d.company.name}: ${result.reason}`);
    }
    await db.insert(schema.events).values({ name: "weekly_checkin_sent", companyId: d.company.id, props: { recipients: d.to.length, overdue: d.items.overdue.length, due: d.items.dueThisWeek.length }, createdAt: now });
  }
  return { due: due.length, sent, failed };
}
