import type { Metadata } from "next";
import { Clause, CONTACT_EMAIL, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Refund policy · Growth Goaled" };

/** Refunds and cancellations for each plan. */
export default function RefundsPage() {
  return (
    <LegalPage title="Refund policy" updated="November 6, 2026">
      <Clause title="Diagnose (one-time action plan)">
        <p>If you change your mind before you submit your plan for review, email us and we&apos;ll refund you in full. Once it&apos;s submitted, an advisor starts work on it and it isn&apos;t refundable; if the delivered plan misses what you asked for, tell us and we&apos;ll revise it.</p>
      </Clause>
      <Clause title="Execute & Monitor (monthly)">
        <p>Cancel any time from your billing settings or by emailing us. Cancellation takes effect at the end of the month you&apos;ve paid for; you keep access until then. We don&apos;t refund part-months or unused live hours.</p>
      </Clause>
      <Clause title="Custom projects">
        <p>Refunds follow the scope and terms agreed for your project before you pay.</p>
      </Clause>
      <Clause title="How to ask">
        <p>Email {CONTACT_EMAIL} with the email you bought with. Approved refunds go back to the original card through Stripe, usually within 5 to 10 business days.</p>
      </Clause>
    </LegalPage>
  );
}
