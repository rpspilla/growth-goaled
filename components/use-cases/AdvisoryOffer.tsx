/**
 * The advisor offer at the end of results. With gaps, a review of them with an executive-level
 * advisor; with complete data, a monthly call to keep the plan on schedule. Never gates the results.
 */
export function AdvisoryOffer({ kind, price, href, target }: { kind: "review" | "monthly"; price: string; href: string; target: string | null }) {
  const copy =
    kind === "review"
      ? {
          title: "Review these results with an executive advisor",
          body: "Your report is built as far as your data allows, and the gaps are listed above. Book time with an executive-level advisor to go through them, pressure-test the findings and agree what to do next.",
          cta: "Book a review",
        }
      : {
          title: "Stay on track with a monthly executive advisor call",
          body: `Your data is complete and the action plan is clear. A monthly call with an executive-level advisor keeps the plan moving and your objective on schedule${target ? ` (${target})` : ""}.`,
          cta: "Book your monthly call",
        };
  return (
    <aside className="rounded-xl p-5 sm:p-6 border-l-4" style={{ background: "var(--navy)", borderLeftColor: "var(--green)" }} aria-label="Executive advisor">
      <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--green)" }}>Optional · from {price}</div>
      <p className="text-base font-medium mb-1" style={{ color: "#E2EAF4" }}>{copy.title}</p>
      <p className="text-sm mb-4" style={{ color: "#9BB3CA" }}>{copy.body}</p>
      <a href={href} className="inline-block px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>
        {copy.cta} →
      </a>
    </aside>
  );
}
