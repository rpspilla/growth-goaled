import type { Metadata } from "next";
import Link from "next/link";
import { formatPrice, pricing } from "@/lib/pricing";
import { SUPPORTED_SUMMARY } from "@/lib/plan-offer";
import { AuthShell, Positioning } from "../AuthShell";
import { GuestEntry } from "../GuestEntry";
import { Faq } from "@/components/Faq";

export const metadata: Metadata = {
  title: "Find out what's holding your growth back · Growth Goaled",
  description: "CRO-level growth intelligence for Seed and Series A B2B SaaS founders. Start with a free conversation.",
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
      brand={<Positioning />}
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
          <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Pricing:</span> the account and conversations are free. An action plan is {formatPrice(actionPlanCents)} once (approved by an advisor), or {formatPrice(supportedMonthlyCents)} a month for {SUPPORTED_SUMMARY}, only if you choose it.</p>
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
