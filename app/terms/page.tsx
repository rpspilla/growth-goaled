import type { Metadata } from "next";
import Link from "next/link";
import { Clause, CONTACT_EMAIL, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms of service · Growth Goaled" };

/** Plain-English terms for using Growth Goaled and buying its plans. Reviewed by the owner before launch. */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="November 6, 2026">
      <Clause title="What Growth Goaled is">
        <p>Growth Goaled helps founders of early-stage B2B companies make commercial decisions: conversations that end in a recommendation, action plans reviewed by an experienced revenue leader (&ldquo;CRO advisor&rdquo;), ongoing advisory support, and custom projects. By creating an account or buying anything, you agree to these terms.</p>
      </Clause>
      <Clause title="Advice, not guarantees">
        <p>Recommendations, plans and advice are our best professional judgment based on what you tell us and the data you share. They are not legal, tax, accounting or investment advice, and we don&apos;t guarantee any particular result. You decide what to do with them and remain responsible for your business decisions.</p>
        <p>Parts of Growth Goaled use AI. Every action plan is reviewed by a CRO advisor before it&apos;s delivered; conversation answers are not individually reviewed.</p>
      </Clause>
      <Clause title="Your account">
        <p>You sign in with a link sent to your email. Keep access to that inbox secure; you&apos;re responsible for activity on your account. Tell us at {CONTACT_EMAIL} if you think someone else has access.</p>
      </Clause>
      <Clause title="Plans and payment">
        <p>Prices are shown before you buy. Payments are processed by Stripe; we don&apos;t store your card details.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong style={{ color: "var(--foreground)" }}>Diagnose</strong> is a one-time purchase of a CRO-reviewed 30/60/90-day action plan for one question.</li>
          <li><strong style={{ color: "var(--foreground)" }}>Execute &amp; Monitor</strong> is a monthly subscription that renews automatically each month until you cancel. It includes ongoing plan tracking, advisor chat, a monthly progress review and up to two hours of live CRO support per month (unused hours don&apos;t roll over).</li>
          <li><strong style={{ color: "var(--foreground)" }}>Custom projects</strong> are priced and scoped individually and paid by payment link.</li>
        </ul>
        <p>Refunds and cancellations are covered in our <Link href="/refunds" className="link">refund policy</Link>.</p>
      </Clause>
      <Clause title="Your data">
        <p>You keep ownership of everything you share. You give us permission to use it to provide the service to you, and in anonymized, aggregated form as described in <Link href="/data-use" className="link">how we use your data</Link> and our <Link href="/privacy" className="link">privacy policy</Link>. Only share data you have the right to share.</p>
      </Clause>
      <Clause title="Acceptable use">
        <p>Don&apos;t misuse the service: no attempts to access other companies&apos; data, overload or disrupt it, scrape it, or use it to break the law. We may suspend accounts that do.</p>
      </Clause>
      <Clause title="Liability">
        <p>To the extent the law allows, Growth Goaled isn&apos;t liable for indirect or consequential losses, and our total liability for any claim is limited to the amount you paid us in the twelve months before it.</p>
      </Clause>
      <Clause title="Changes and contact">
        <p>We may update these terms; the date above shows the latest version, and we&apos;ll tell you about material changes by email. Questions: {CONTACT_EMAIL}.</p>
      </Clause>
    </LegalPage>
  );
}
