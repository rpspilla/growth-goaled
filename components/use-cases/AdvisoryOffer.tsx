import Link from "next/link";

/** The optional advisory offer, shown once at the end of results. It never gates the assessment. */
export function AdvisoryOffer({ price, useCase }: { price: string; useCase: string }) {
  return (
    <aside className="rounded-xl p-5 sm:p-6 border-l-4" style={{ background: "var(--navy)", borderLeftColor: "var(--green)" }} aria-label="Optional advisory support">
      <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--green)" }}>Optional</div>
      <p className="text-base font-medium mb-1" style={{ color: "#E2EAF4" }}>Want to pressure-test your findings and turn them into an execution plan?</p>
      <p className="text-sm mb-4" style={{ color: "#9BB3CA" }}>
        Book a working session to review your results, prioritize opportunities, and determine what to do over the next 90 days. From {price}.
      </p>
      <Link href={`/advisory?use_case=${useCase}`} className="inline-block px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>
        Explore advisory support →
      </Link>
    </aside>
  );
}
