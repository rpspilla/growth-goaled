import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import type Stripe from "stripe";
import { canViewCompany } from "@/lib/access";
import { db, schema } from "@/lib/db";
import type { PaymentLink, User } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { track } from "@/lib/events";
import { toCents, type PaymentLinkInput } from "@/lib/payment-links";
import { CURRENCY, formatPrice } from "@/lib/pricing";
import { stripe } from "@/lib/stripe";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const isStaff = (u: Pick<User, "role">) => u.role === "advisor" || u.role === "admin";
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const linkUrl = (appUrl: string, token: string) => `${appUrl}/pay/${token}`;

/** An advisor (or admin) creates a link; optionally emails it to the client. */
export async function createPaymentLink(actor: User, input: PaymentLinkInput, appUrl: string): Promise<Result<{ id: string; url: string; emailed: boolean | null; emailError?: string }>> {
  if (!isStaff(actor)) return { ok: false, error: "Only advisors can create payment links." };
  if (input.companyId) {
    const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, input.companyId)).limit(1);
    if (!company || !canViewCompany(actor, company, [])) return { ok: false, error: "Choose a company from the list." };
  }
  if (input.sendEmail && !input.clientEmail) return { ok: false, error: "Add the client's email to send it to them." };
  const token = randomBytes(18).toString("base64url");
  const [link] = await db
    .insert(schema.paymentLinks)
    .values({ token, title: input.title, description: input.description, amountCents: toCents(input.amount), currency: CURRENCY, clientName: input.clientName, clientEmail: input.clientEmail, companyId: input.companyId, createdBy: actor.id })
    .returning();
  const url = linkUrl(appUrl, link!.token);
  await track("payment_link_created", { userId: actor.id, companyId: input.companyId ?? undefined, props: { payment_link_id: link!.id, amount_cents: link!.amountCents } });
  if (!input.sendEmail || !input.clientEmail) return { ok: true, id: link!.id, url, emailed: null };
  const sent = await sendLinkEmail(actor, link!, url);
  return { ok: true, id: link!.id, url, emailed: sent.sent, ...(sent.sent ? {} : { emailError: sent.reason }) };
}

async function sendLinkEmail(actor: Pick<User, "name" | "email">, link: PaymentLink, url: string) {
  const from = actor.name || "Growth Goaled";
  const amount = formatPrice(link.amountCents);
  return sendEmail({
    to: link.clientEmail!,
    subject: `${link.title}: payment from Growth Goaled`,
    text: `${link.clientName ? `Hi ${link.clientName},\n\n` : ""}${from} at Growth Goaled has sent you a payment link for ${link.title} (${amount}).\n\n${link.description ? `${link.description}\n\n` : ""}Pay securely here: ${url}\n`,
    html: `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:520px">
${link.clientName ? `<p style="font-size:15px">Hi ${esc(link.clientName)},</p>` : ""}
<p style="font-size:15px">${esc(from)} at Growth Goaled has sent you a payment link for <strong>${esc(link.title)}</strong> (${amount}).</p>
${link.description ? `<p style="font-size:15px;white-space:pre-wrap">${esc(link.description)}</p>` : ""}
<p><a href="${esc(url)}" style="display:inline-block;background:#155A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Review and pay ${amount}</a></p>
</div>`,
  }).catch((err) => ({ sent: false as const, reason: err instanceof Error ? err.message : String(err) }));
}

/** Links the advisor made (admins see everyone's), newest first. */
export async function listPaymentLinks(actor: User) {
  const rows = await db
    .select({ link: schema.paymentLinks, company: schema.companies.name, author: schema.users.name, authorEmail: schema.users.email })
    .from(schema.paymentLinks)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.paymentLinks.companyId))
    .leftJoin(schema.users, eq(schema.users.id, schema.paymentLinks.createdBy))
    .where(actor.role === "admin" ? undefined : eq(schema.paymentLinks.createdBy, actor.id))
    .orderBy(desc(schema.paymentLinks.createdAt))
    .limit(200);
  return rows.map((r) => ({ ...r.link, company: r.company, author: r.author || r.authorEmail }));
}

/** Stops an open link from taking payment (its creator, or an admin). */
export async function cancelPaymentLink(actor: User, id: string): Promise<Result> {
  if (!isStaff(actor)) return { ok: false, error: "Only advisors can change payment links." };
  const owner = actor.role === "admin" ? undefined : eq(schema.paymentLinks.createdBy, actor.id);
  const updated = await db
    .update(schema.paymentLinks)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(schema.paymentLinks.id, id), eq(schema.paymentLinks.status, "open"), owner))
    .returning({ id: schema.paymentLinks.id });
  return updated.length ? { ok: true } : { ok: false, error: "Only an open link you created can be cancelled." };
}

export async function linkByToken(token: string): Promise<PaymentLink | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [link] = await db.select().from(schema.paymentLinks).where(eq(schema.paymentLinks.token, token)).limit(1);
  return link ?? null;
}

/** The client clicked "Pay": a one-time Stripe Checkout for the link's amount. */
export async function startLinkCheckout(token: string, appUrl: string, client: Stripe = stripe()): Promise<Result<{ url: string }>> {
  const link = await linkByToken(token);
  if (!link) return { ok: false, error: "This payment link doesn't exist." };
  if (link.status !== "open") return { ok: false, error: link.status === "paid" ? "This has already been paid." : "This payment link is no longer active." };
  const session = await client.checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: link.currency, unit_amount: link.amountCents, product_data: { name: link.title, ...(link.description ? { description: link.description.slice(0, 500) } : {}) } } }],
    ...(link.clientEmail ? { customer_email: link.clientEmail } : {}),
    client_reference_id: link.id,
    metadata: { purpose: "payment_link", paymentLinkId: link.id },
    success_url: `${linkUrl(appUrl, link.token)}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: linkUrl(appUrl, link.token),
  });
  if (!session.url) return { ok: false, error: "Checkout couldn't be opened. Please try again." };
  await db.update(schema.paymentLinks).set({ stripeSessionId: session.id, updatedAt: new Date() }).where(eq(schema.paymentLinks.id, link.id));
  await track("payment_link_checkout_started", { companyId: link.companyId ?? undefined, props: { payment_link_id: link.id } });
  return { ok: true, url: session.url };
}

type SessionLike = Pick<Stripe.Checkout.Session, "id" | "payment_status" | "amount_total" | "client_reference_id"> & { metadata?: Stripe.Metadata | null; customer_details?: { email?: string | null } | null };

/**
 * A Checkout for a link was paid (webhook or the success page): marks it paid once and tells the
 * advisor who sent it (and OWNER_NOTIFY_EMAIL). Only a paid session for this link, for at least its
 * amount, counts. Returns whether the session was a payment link's.
 */
export async function recordPaidLink(session: SessionLike): Promise<boolean> {
  const id = session.metadata?.paymentLinkId;
  if (session.metadata?.purpose !== "payment_link" || !id) return false;
  if (session.payment_status !== "paid" || session.client_reference_id !== id) return true;
  const [link] = await db.select().from(schema.paymentLinks).where(eq(schema.paymentLinks.id, id)).limit(1);
  if (!link || (session.amount_total ?? 0) < link.amountCents) return true;
  const won = await db
    .update(schema.paymentLinks)
    .set({ status: "paid", paidAt: new Date(), paidEmail: session.customer_details?.email ?? link.clientEmail, stripeSessionId: session.id, updatedAt: new Date() })
    .where(and(eq(schema.paymentLinks.id, id), or(eq(schema.paymentLinks.status, "open"), eq(schema.paymentLinks.status, "cancelled"))))
    .returning();
  if (!won.length) return true;
  await track("payment_link_paid", { userId: link.createdBy ?? undefined, companyId: link.companyId ?? undefined, props: { payment_link_id: link.id, amount_cents: link.amountCents } });
  const [author] = link.createdBy ? await db.select().from(schema.users).where(eq(schema.users.id, link.createdBy)).limit(1) : [];
  const to = [...new Set([author?.email, process.env.OWNER_NOTIFY_EMAIL?.trim()].filter((e): e is string => Boolean(e)))];
  const who = link.clientName || session.customer_details?.email || link.clientEmail || "A client";
  for (const address of to) {
    const r = await sendEmail({
      to: address,
      subject: `Paid: ${link.title} (${formatPrice(link.amountCents)})`,
      text: `${who} paid ${formatPrice(link.amountCents)} for ${link.title}.\n`,
      html: `<p style="font-family:Inter,Arial,sans-serif;font-size:15px">${esc(who)} paid <strong>${formatPrice(link.amountCents)}</strong> for ${esc(link.title)}.</p>`,
    }).catch((err) => ({ sent: false as const, reason: String(err) }));
    if (!r.sent) console.error(`[payment-link] Paid notice to ${address} wasn't sent: ${r.reason}`);
  }
  return true;
}

/** The success page: confirm with Stripe in case the webhook hasn't arrived yet. */
export async function confirmLinkCheckout(link: PaymentLink, sessionId: string, client: Stripe = stripe()): Promise<void> {
  if (link.status === "paid" || !/^cs_[A-Za-z0-9_-]+$/.test(sessionId)) return;
  const session = (await client.checkout.sessions.retrieve(sessionId)) as SessionLike;
  if (session.metadata?.paymentLinkId !== link.id) return;
  await recordPaidLink(session);
}
