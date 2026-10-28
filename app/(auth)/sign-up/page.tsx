import type { Metadata } from "next";
import Link from "next/link";
import { track } from "@/lib/events";
import { formatPrice, pricing } from "@/lib/pricing";
import { AuthShell, Positioning } from "../AuthShell";
import { MagicLinkForm } from "../MagicLinkForm";

export const metadata: Metadata = {
  title: "Find out what's holding your growth back · Growth Goaled",
  description: "CRO-level growth intelligence for Seed and Series A B2B SaaS founders. Start with a free Growth Snapshot.",
};

const NEXT = [
  { title: "Confirm your email", body: "We send a secure link. No password." },
  { title: "Tell us about your company", body: "Name and revenue range. About a minute." },
  { title: "Pick a growth question", body: "Answer a few questions and get your free Growth Snapshot." },
];

/** The main conversion page: what this is, why it matters at your stage, and exactly what happens next. */
export default async function SignUpPage() {
  await track("signup_viewed");
  const price = formatPrice(pricing().assessmentCents);
  return (
    <AuthShell
      brand={
        <>
          <Positioning />
          <div className="mt-10 rounded-2xl p-5 max-w-md hidden lg:block" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} aria-label="What the free Snapshot covers">
            <div className="text-sm font-semibold" style={{ color: "#3DDC97" }}>Your free Growth Snapshot</div>
            <div className="text-base font-semibold text-white mt-1">“Where is our growth leaking?”</div>
            <ul className="mt-3 space-y-2 text-sm" style={{ color: "#B7C5D4" }}>
              <li>· Early hypotheses from your answers, each with what it&apos;s based on</li>
              <li>· Whether this is the right question for your stage</li>
              <li>· The data that would confirm or rule each one out</li>
            </ul>
          </div>
        </>
      }
    >
      <h2 className="text-2xl sm:text-3xl font-semibold" style={{ color: "var(--foreground)", letterSpacing: "-0.01em" }}>Create your free account</h2>
      <p className="text-base mt-2 mb-6" style={{ color: "var(--muted-foreground)" }}>Built for Seed and Series A B2B SaaS founders.</p>
      <MagicLinkForm mode="sign-up" cta="Get my free Growth Snapshot" />

      <div className="mt-8 pt-6 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>What happens next</div>
        <ol className="space-y-3">
          {NEXT.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--green-muted)", color: "var(--green)" }}>{i + 1}</span>
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                <span className="font-semibold" style={{ color: "var(--foreground)" }}>{s.title}.</span> {s.body}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-6 space-y-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
          <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Pricing:</span> the account and Snapshot are free. A full assessment from your own data is {price} per question, only if you choose it. No subscription.</p>
          <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Your data:</span> used only for your own analysis, never shown to other companies.</p>
          <p><Link href="/sample" className="link">See a sample company first →</Link></p>
        </div>
      </div>
    </AuthShell>
  );
}
