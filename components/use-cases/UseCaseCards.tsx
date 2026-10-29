import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { OUTCOME_ICONS } from "@/components/visual/icons";
import { ExpandableDetail, StatusChip } from "@/components/visual/primitives";
import { QuestionIllustration } from "@/components/visual/QuestionIllustration";
import type { UseCaseDef } from "@/lib/use-cases";
import { visualFor } from "@/lib/use-cases/visual";

export type CardState = "active" | "started" | null;

/**
 * The library: each card is a question the founder is facing, shown as an illustration, the
 * question, one line on when to ask it and three outcome chips. "Use it when" and "You'll decide"
 * stay one tap away under Details. Recommended questions come first, marked with a ribbon.
 */
export function UseCaseCards({
  useCases,
  recommended,
  states,
  hrefFor,
  price,
  sellable,
}: {
  useCases: readonly UseCaseDef[];
  recommended: readonly string[];
  states: Record<string, CardState>;
  hrefFor: (id: string) => string;
  /** Formatted assessment price, or null where prices aren't shown (advisor view). */
  price?: string | null;
  sellable?: readonly string[];
}) {
  // Recommended first, "Coming soon" last.
  const rank = (u: UseCaseDef) => (u.comingSoon ? 2 : recommended.includes(u.id) ? 0 : 1);
  const ordered = [...useCases].sort((a, b) => rank(a) - rank(b));
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {ordered.map((u) => {
        const v = visualFor(u.id);
        const state = states[u.id];
        const isRecommended = recommended.includes(u.id);
        if (u.comingSoon) {
          return (
            <article key={u.id} className="surface p-4 flex flex-col gap-3" style={{ background: "var(--muted)" }} aria-label={`${u.question} (coming soon)`}>
              <QuestionIllustration id={u.id} muted className="h-24" />
              <div>
                <StatusChip status="soon" />
              </div>
              <h2 className="font-display text-xl leading-tight" style={{ color: "var(--muted-foreground)" }}>
                {u.question}
              </h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {v.oneLine}
              </p>
            </article>
          );
        }
        const cta = state === "active" ? "Open your assessment" : state === "started" ? "Continue" : "Start with a free Snapshot";
        return (
          <article
            key={u.id}
            className="surface p-4 flex flex-col gap-3 relative hover:shadow-md transition-shadow"
            style={{ borderColor: isRecommended ? "var(--green)" : undefined, boxShadow: isRecommended ? "0 0 0 1px var(--green)" : undefined }}
          >
            <div className="relative">
              <QuestionIllustration id={u.id} className="h-28" />
              {isRecommended && (
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md shadow-sm" style={{ background: "var(--green)", color: "#fff" }}>
                  <Star size={12} fill="currentColor" aria-hidden /> Recommended for you
                </span>
              )}
              {state && (
                <span className="absolute top-2 right-2">
                  {state === "active" ? <Pill tone="green">Purchased</Pill> : <Pill tone="amber">In progress</Pill>}
                </span>
              )}
            </div>
            <h2 className="font-display text-2xl leading-tight" style={{ color: "var(--foreground)" }}>
              {u.question}
            </h2>
            <p className="text-sm -mt-1" style={{ color: "var(--muted-foreground)" }}>
              {v.oneLine}
            </p>
            <ul className="flex flex-wrap gap-1.5" aria-label="What you get">
              {v.outcomes.map((o) => {
                const Icon = OUTCOME_ICONS[o.icon];
                return (
                  <li key={o.label} data-label className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
                    <Icon size={13} aria-hidden />
                    {o.label}
                  </li>
                );
              })}
            </ul>
            <ExpandableDetail summary="Details">
              <p>
                <span className="font-semibold" style={{ color: "var(--foreground)" }}>Use it when: </span>
                {u.forWho}
              </p>
              <p>
                <span className="font-semibold" style={{ color: "var(--foreground)" }}>You&apos;ll decide: </span>
                {u.decision}
              </p>
            </ExpandableDetail>
            <div className="mt-auto pt-2 flex items-center justify-between gap-2 flex-wrap">
              <Link href={hrefFor(u.id)} className={`btn ${state === "active" || isRecommended ? "btn-primary" : "btn-secondary"}`} aria-label={`${cta}: ${u.question}`}>
                {cta} <ArrowRight size={16} aria-hidden />
              </Link>
              {price !== null && price !== undefined && (
                <span data-label className="text-[11px] font-mono px-2 py-1 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                  {sellable?.includes(u.id) ? `Snapshot free · Assessment ${price}` : "Snapshot free · Assessment soon"}
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
