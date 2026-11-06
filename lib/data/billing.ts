import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";

/**
 * Stripe's hosted billing portal for the company's Execute & Monitor subscription: cancel (at the end
 * of the paid month), change card, see invoices. Only for a subscription this company bought.
 */
export async function billingPortalUrl(company: Pick<Company, "id">, returnUrl: string, client: Stripe = stripe()): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const [plan] = await db
    .select({ subscription: schema.actionPlans.stripeSubscriptionId })
    .from(schema.actionPlans)
    .where(and(eq(schema.actionPlans.companyId, company.id), eq(schema.actionPlans.tier, "supported"), isNotNull(schema.actionPlans.stripeSubscriptionId)))
    .orderBy(desc(schema.actionPlans.updatedAt))
    .limit(1);
  if (!plan?.subscription) return { ok: false, error: "There's no subscription to manage yet." };
  const subscription = await client.subscriptions.retrieve(plan.subscription);
  const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const session = await client.billingPortal.sessions.create({ customer, return_url: returnUrl });
  return { ok: true, url: session.url };
}
