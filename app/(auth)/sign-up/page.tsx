import type { Metadata } from "next";
import Link from "next/link";
import { formatPrice, pricing } from "@/lib/pricing";
import { AuthShell, Positioning } from "../AuthShell";
import { GuestEntry } from "../GuestEntry";
import { Faq } from "@/components/Faq";

export const metadata: Metadata = {
  title: "Find out what's holding your growth back · Growth Goaled",
  description: "CRO-level growth intelligence for Seed and Series A B2B SaaS founders. Start with a free Growth Snapshot.",
};

const NEXT = [
  { title: "Tell us what you're working on", body: "In your own words, above." },
  { title: "A few quick questions about your company", body: "Revenue, founding year, stage, vertical and team. About a minute." },
  { title: "See your recommendation", body: "Enter your email to unlock it; we send a link to save it. No password." },
];

/** The main conversion page: what this is, why it matters at your stage, and exactly what happens next. */
// The guest chat's answers can take a little while.
export const maxDuration = 300;

export default function SignUpPage() {
  const { actionPlanCents, supportedMonthlyCents } = pricing();
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
      <GuestEntry />

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
          <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Pricing:</span> the account, conversations and Snapshot are free. An action plan is {formatPrice(actionPlanCents)} once (approved by an advisor), or {formatPrice(supportedMonthlyCents)} a month with a CRO-level advisor, only if you choose it.</p>
          <p>
            <span className="font-semibold" style={{ color: "var(--foreground)" }}>Your data:</span> used for your own analysis and never shown to other companies. In anonymized,
            aggregated form only, it also helps improve our recommendations and benchmarks. <Link href="/data-use" className="link">How we use your data</Link>
          </p>
          <p><Link href="/sample" className="link">See a sample company first →</Link></p>
        </div>
        <Faq className="mt-6" />
      </div>
    </AuthShell>
  );
}
