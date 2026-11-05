import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { HumanPresence } from "@/components/brand/HumanPresence";
import { confirmLinkCheckout, linkByToken } from "@/lib/data/payment-links";
import { formatPrice } from "@/lib/pricing";
import { stripeConfigured } from "@/lib/stripe";

export const metadata: Metadata = { title: "Payment · Growth Goaled", robots: { index: false } };

/** What a client sees from a custom-project payment link: what it's for, the amount, and Pay. No account needed. */
export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ session_id?: string; error?: string }> }) {
  const [{ token }, { session_id: sessionId, error }] = await Promise.all([params, searchParams]);
  let link = await linkByToken(token);
  if (!link) notFound();
  if (sessionId && link.status !== "paid" && stripeConfigured()) {
    await confirmLinkCheckout(link, sessionId).catch((err) => console.error("[payment-link] Confirming checkout failed", err));
    link = (await linkByToken(token))!;
  }
  const amount = formatPrice(link.amountCents);
  return (
    <main className="min-h-screen px-4 py-12 flex justify-center" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: "var(--green)" }} aria-hidden>G</span>
          <span className="font-semibold" style={{ color: "var(--foreground)" }}>Growth Goaled</span>
        </div>
        <section aria-label="Payment" className="surface p-6 space-y-5">
          <div>
            <div className="label mb-1" style={{ color: "var(--green)" }}>{link.clientName ? `For ${link.clientName}` : "Custom project"}</div>
            <h1 className="font-display text-3xl leading-tight" style={{ color: "var(--foreground)" }}>{link.title}</h1>
          </div>
          {link.description && <p className="text-base whitespace-pre-wrap" style={{ color: "var(--foreground)" }}>{link.description}</p>}
          <div className="flex items-baseline justify-between border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <span className="text-base" style={{ color: "var(--muted-foreground)" }}>Total</span>
            <span className="text-3xl font-semibold" style={{ color: "var(--foreground)" }}>{amount}</span>
          </div>
          {link.status === "paid" ? (
            <div role="status" className="rounded-lg p-4 flex gap-3 items-start" style={{ background: "var(--green-muted)" }}>
              <CheckCircle2 size={22} style={{ color: "var(--green)" }} aria-hidden />
              <div className="text-base" style={{ color: "var(--foreground)" }}>
                <strong>Paid. Thank you.</strong> Your receipt is on its way by email, and your advisor will be in touch about next steps.
              </div>
            </div>
          ) : link.status === "cancelled" ? (
            <p role="status" className="text-base" style={{ color: "var(--muted-foreground)" }}>This payment link is no longer active. Please contact your Growth Goaled advisor.</p>
          ) : (
            <form method="post" action={`/pay/${token}/checkout`} className="space-y-2">
              <button type="submit" className="btn btn-primary w-full inline-flex items-center justify-center gap-2">
                <Lock size={16} aria-hidden /> Pay {amount}
              </button>
              <p className="text-xs text-center" style={{ color: "var(--muted-foreground)" }}>Secure card payment through Stripe.</p>
              {error && <p role="alert" className="text-sm text-center" style={{ color: "var(--red)" }}>{error}</p>}
            </form>
          )}
        </section>
        <HumanPresence />
      </div>
    </main>
  );
}
