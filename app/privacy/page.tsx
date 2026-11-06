import type { Metadata } from "next";
import Link from "next/link";
import { Clause, CONTACT_EMAIL, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy policy · Growth Goaled" };

/** What personal data Growth Goaled collects, why, who processes it, and how to have it exported or deleted. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 6, 2026">
      <Clause title="What we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li>Account details: your name and email.</li>
          <li>Company details you give us: stage, revenue range, vertical, team size and similar.</li>
          <li>What you share to get advice: your conversations, answers, files and figures.</li>
          <li>Payment records (amount, date, what was bought). Card details go to Stripe, never to us.</li>
          <li>Basic usage events (for example, which pages you open) to improve the product.</li>
        </ul>
      </Clause>
      <Clause title="How we use it">
        <p>To give you recommendations and plans, to let your advisor work with you, to send the emails you need (sign-in links, plan updates, receipts), and to improve Growth Goaled. Your company&apos;s data is never shown to another company. See <Link href="/data-use" className="link">how we use your data</Link> for anonymized, aggregated use.</p>
      </Clause>
      <Clause title="Who processes it for us">
        <p>We use trusted providers to run the service: hosting and file storage (Vercel), our database and sign-in (Neon), payments (Stripe), email (Resend), and AI processing of your conversations and files (Anthropic). They process data only to provide their service to us.</p>
      </Clause>
      <Clause title="How long we keep it">
        <p>For as long as your account is open, and afterwards only as long as we need to for legal, tax or accounting reasons.</p>
      </Clause>
      <Clause title="Your choices">
        <p>You can ask us for a copy of your data, to correct it, or to delete your account and data, by emailing {CONTACT_EMAIL}. We&apos;ll confirm it&apos;s you and act within 30 days.</p>
      </Clause>
      <Clause title="Security">
        <p>Data is encrypted in transit, files are stored privately, and access within Growth Goaled is limited to the people working with you.</p>
      </Clause>
      <Clause title="Contact">
        <p>Questions or requests: {CONTACT_EMAIL}.</p>
      </Clause>
    </LegalPage>
  );
}
