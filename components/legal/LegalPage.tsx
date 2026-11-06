import Link from "next/link";
import type { ReactNode } from "react";
import { LegalLinks } from "./LegalLinks";

export const CONTACT_EMAIL = "ryan@growthgoaled.com";
const fg = { color: "var(--foreground)" };

/** The shared frame for the public policy pages (readable without signing in). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-12" style={{ background: "var(--background)" }}>
      <article className="max-w-2xl mx-auto space-y-6">
        <Link href="/" className="link text-sm">← Growth Goaled</Link>
        <div>
          <h1 className="font-display text-4xl font-normal" style={fg}>{title}</h1>
          <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>Last updated {updated}</p>
        </div>
        <div className="space-y-6">{children}</div>
        <LegalLinks className="pt-6 border-t" />
      </article>
    </main>
  );
}

/** One titled section of a policy. */
export function Clause({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold" style={fg}>{title}</h2>
      <div className="text-base space-y-2" style={{ color: "var(--muted-foreground)" }}>{children}</div>
    </section>
  );
}
