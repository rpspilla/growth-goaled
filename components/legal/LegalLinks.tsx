import Link from "next/link";

/** Terms, privacy, refunds and data use: under every sign-in screen, buy button and payment page. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex gap-x-4 gap-y-1 flex-wrap text-xs ${className}`} style={{ color: "var(--muted-foreground)" }}>
      <Link href="/terms" className="hover:underline">Terms</Link>
      <Link href="/privacy" className="hover:underline">Privacy</Link>
      <Link href="/refunds" className="hover:underline">Refunds</Link>
      <Link href="/data-use" className="hover:underline">How we use your data</Link>
    </nav>
  );
}
