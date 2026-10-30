import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { getUseCase, isUseCaseId, type UseCaseId } from "@/lib/use-cases";
import { progressView, type ProgressView } from "./plan";

/**
 * The monthly reminder (first-session simplification, "come back next month"): once a plan has
 * been tracked for 30 days, and every 30 days after, each founder on the company gets one email:
 * how their tracked metrics compare with the baseline, how many actions are done, the next action,
 * and a link to upload this month's key file. Sends and unsubscribes are recorded as events, so a
 * daily job (app/api/cron/monthly-reminder) can run safely more than once.
 */

export const REMINDER_EVERY_DAYS = 30;
const DAY = 86_400_000;

const secret = () => process.env.CRON_SECRET || process.env.NEON_AUTH_COOKIE_SECRET || "";
export const unsubscribeToken = (userId: string) => createHmac("sha256", secret()).update(`monthly-reminder:${userId}`).digest("hex").slice(0, 32);
export function validUnsubscribe(userId: string, token: string): boolean {
  if (!secret()) return false;
  const want = Buffer.from(unsubscribeToken(userId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

export type DueReminder = { company: Company; useCase: UseCaseId; to: { userId: string; email: string; name: string | null }[] };

/** Plans tracked for at least 30 days since they were committed or last reminded. */
export async function dueReminders(now = new Date()): Promise<DueReminder[]> {
  const plans = await db
    .select({ companyId: schema.planActions.companyId, useCase: schema.companyUseCases.useCase, at: schema.planActions.createdAt })
    .from(schema.planActions)
    .innerJoin(schema.companyUseCases, eq(schema.companyUseCases.id, schema.planActions.companyUseCaseId))
    .orderBy(desc(schema.planActions.createdAt));
  // Latest commit per company and question.
  const latest = new Map<string, { companyId: string; useCase: UseCaseId; at: Date }>();
  for (const p of plans) {
    const key = `${p.companyId}:${p.useCase}`;
    if (!latest.has(key) && isUseCaseId(p.useCase)) latest.set(key, { companyId: p.companyId, useCase: p.useCase, at: p.at });
  }
  if (!latest.size) return [];
  const companyIds = [...new Set([...latest.values()].map((l) => l.companyId))];
  const [companies, members, sent, unsubscribed] = await Promise.all([
    db.select().from(schema.companies).where(inArray(schema.companies.id, companyIds)),
    db
      .select({ companyId: schema.companyMembers.companyId, userId: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role })
      .from(schema.companyMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
      .where(inArray(schema.companyMembers.companyId, companyIds)),
    db
      .select({ companyId: schema.events.companyId, props: schema.events.props, at: schema.events.createdAt })
      .from(schema.events)
      .where(and(eq(schema.events.name, "monthly_reminder_sent"), inArray(schema.events.companyId, companyIds))),
    db.select({ userId: schema.events.userId }).from(schema.events).where(eq(schema.events.name, "monthly_reminder_unsubscribed")),
  ]);
  const optedOut = new Set(unsubscribed.map((u) => u.userId));
  const out: DueReminder[] = [];
  for (const l of latest.values()) {
    const company = companies.find((c) => c.id === l.companyId);
    if (!company || company.isSample) continue;
    const lastSent = sent
      .filter((s) => s.companyId === l.companyId && (s.props as { use_case?: string } | null)?.use_case === l.useCase)
      .reduce<Date | null>((m, s) => (!m || s.at > m ? s.at : m), null);
    const since = lastSent && lastSent > l.at ? lastSent : l.at;
    if (now.getTime() - since.getTime() < REMINDER_EVERY_DAYS * DAY) continue;
    const to = members.filter((m) => m.companyId === l.companyId && m.role === "founder" && !optedOut.has(m.userId)).map((m) => ({ userId: m.userId, email: m.email, name: m.name }));
    if (to.length) out.push({ company, useCase: l.useCase, to });
  }
  return out;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The email for one founder: progress against baseline, the next action, and this month's upload. */
export function reminderEmail(p: { company: Pick<Company, "name">; useCase: UseCaseId; view: ProgressView; appUrl: string; unsubscribeUrl: string; name: string | null }) {
  const def = getUseCase(p.useCase)!;
  const live = p.view.actions.filter((a) => a.status !== "dropped");
  const done = live.filter((a) => a.status === "done").length;
  const next = live.find((a) => a.status !== "done");
  const moved = p.view.metrics.filter((m) => m.latest);
  const metrics = (moved.length ? moved : p.view.metrics).slice(0, 3);
  const arrow = (d: string | null) => (d === "better" ? "▲ improving" : d === "worse" ? "▼ worse" : d === "same" ? "no change" : "no new figure yet");
  const file = def.keyFile?.label.toLowerCase() ?? "latest data";
  const subject = `${p.company.name}: is the plan working? A 2-minute check`;
  const lines = metrics.map((m) => `${m.label}: ${m.baseline ?? "—"} → ${m.latest ?? "—"} (${arrow(m.direction)})`);
  const text = `${p.name ? `Hi ${p.name.split(" ")[0]},\n\n` : ""}It's been a month on your ${def.shortTitle} plan. ${done} of ${live.length} actions done.

${lines.join("\n")}

${moved.length ? "" : `No new figures since your results. Upload this month's ${file} to see whether it's working: ${p.appUrl}/data\n\n`}${next ? `Next action: ${next.action}\n\n` : ""}Open your Action plan: ${p.appUrl}/progress

Stop these monthly emails: ${p.unsubscribeUrl}`;
  const row = (m: (typeof metrics)[number]) =>
    `<tr><td style="padding:6px 0;color:#4F5D6E">${escape(m.label)}</td><td style="padding:6px 0;font-family:monospace;text-align:right">${escape(m.baseline ?? "—")} → <strong>${escape(m.latest ?? "—")}</strong></td><td style="padding:6px 0 6px 12px;font-size:12px;color:${m.direction === "better" ? "#155A3C" : m.direction === "worse" ? "#B91C1C" : "#5F6B7C"}">${arrow(m.direction)}</td></tr>`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:520px">
${p.name ? `<p style="font-size:15px">Hi ${escape(p.name.split(" ")[0]!)},</p>` : ""}
<p style="font-size:15px">It's been a month on your <strong>${escape(def.shortTitle)}</strong> plan. <strong>${done} of ${live.length}</strong> actions done.</p>
${metrics.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 16px">${metrics.map(row).join("")}</table>` : ""}
${moved.length ? "" : `<p style="font-size:14px">No new figures since your results. Upload this month's ${escape(file)} to see whether it's working.</p>`}
<p><a href="${escape(p.appUrl)}/data" style="display:inline-block;background:#155A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Upload this month's file</a></p>
${next ? `<p style="font-size:14px"><strong>Next action:</strong> ${escape(next.action)}</p>` : ""}
<p style="font-size:14px"><a href="${escape(p.appUrl)}/progress" style="color:#155A3C;font-weight:600">Open your Action plan →</a></p>
<p style="font-size:12px;color:#5F6B7C">Know where you stand. Know what to fix. Know what comes next.<br><a href="${escape(p.unsubscribeUrl)}" style="color:#5F6B7C">Stop these monthly emails</a></p>
</div>`;
  return { subject, text, html };
}

/** Sends every reminder that's due. Returns what happened, for the cron log. */
export async function sendMonthlyReminders(now = new Date()): Promise<{ due: number; sent: number; failed: string[] }> {
  const appUrl = (process.env.APP_URL ?? "https://app.growthgoaled.com").replace(/\/$/, "");
  const due = await dueReminders(now);
  let sent = 0;
  const failed: string[] = [];
  for (const d of due) {
    const view = await progressView(d.company, d.useCase);
    if (!view) continue;
    for (const to of d.to) {
      const unsubscribeUrl = `${appUrl}/api/email/unsubscribe?u=${to.userId}&t=${unsubscribeToken(to.userId)}`;
      const email = reminderEmail({ company: d.company, useCase: d.useCase, view, appUrl, unsubscribeUrl, name: to.name });
      const result = await sendEmail({ to: to.email, ...email });
      if (result.sent) sent++;
      else failed.push(`${d.company.name}: ${result.reason}`);
    }
    // Recorded once per company and question, sent or not, so a misconfigured mailer can't cause a daily retry storm.
    // Stamped with the run's clock, which decides when the next one is due.
    await db.insert(schema.events).values({ name: "monthly_reminder_sent", companyId: d.company.id, props: { use_case: d.useCase, recipients: d.to.length }, createdAt: now });
  }
  return { due: due.length, sent, failed };
}
