import Link from "next/link";
import type { ReactNode } from "react";
import { StagingBadge } from "@/components/shell/Shell";

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0 mt-0.5">
    <circle cx="10" cy="10" r="10" fill="rgba(61,220,151,0.16)" />
    <path d="M6 10.2l2.6 2.6L14 7.4" stroke="#3DDC97" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A short list of true statements, used on the brand side of the auth screens. */
export function Points({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-base" style={{ color: "#D5DEE8" }}>
          <Check />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Split screen for sign-up, sign-in, invites and the welcome step: what Growth Goaled is on the
 * navy side, the one thing to do on the white side. Stacks on small screens, form second.
 */
export function AuthShell({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]" style={{ background: "var(--card)" }}>
      <div className="relative overflow-hidden px-6 sm:px-12 py-10 lg:py-14 flex flex-col" style={{ background: "var(--navy)" }}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "radial-gradient(ellipse 70% 55% at 20% 30%, rgba(21,90,60,0.32) 0%, transparent 70%)" }}
        />
        <div className="relative flex items-center gap-2.5">
          <Link href="/sign-up" className="flex items-center gap-2.5" aria-label="Growth Goaled">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: "var(--green)", color: "#fff" }}>G</span>
            <span className="font-semibold text-white text-base tracking-tight">Growth Goaled</span>
          </Link>
          <StagingBadge />
        </div>
        <div className="relative flex-1 flex flex-col justify-center max-w-xl py-10 lg:py-0">{brand}</div>
      </div>
      <div className="flex items-center justify-center px-6 sm:px-12 py-10 lg:py-14">
        <div className="w-full max-w-md" style={{ animation: "fadeInUp 0.35s ease-out" }}>{children}</div>
      </div>
    </div>
  );
}

/** Brand side copy shared by sign-up and sign-in. */
export function Positioning({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <div className="text-sm font-semibold mb-4" style={{ color: "#3DDC97" }}>Your Seed &amp; Series A Stage CRO</div>
      <h1 className="font-display text-4xl sm:text-5xl font-normal leading-[1.08] text-white" style={{ letterSpacing: "-0.015em" }}>
        Find out what&apos;s holding your growth back.
      </h1>
      <p className="text-lg mt-5" style={{ color: "#B7C5D4" }}>
        CRO-level growth intelligence for Seed and Series A B2B SaaS founders. Find your biggest growth opportunity, decide where your capital goes, and build a more repeatable path to revenue.
      </p>
      {!compact && (
        <div className="mt-8">
          <Points
            items={[
              "Start with the growth question you need answered",
              "Turn your company's data into clear priorities and next steps",
              "Every conclusion shows the evidence and how sure we are",
            ]}
          />
        </div>
      )}
    </>
  );
}
