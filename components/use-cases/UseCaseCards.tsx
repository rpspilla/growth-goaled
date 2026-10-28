import Link from "next/link";
import { Pill } from "@/components/ui/Pill";
import type { UseCaseDef } from "@/lib/use-cases";

export type CardState = "active" | "started" | null;

/**
 * The library: each card is a question the founder is facing, when to ask it, the decision it
 * settles, and one clear way to start. Recommended questions come first.
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
    <div className="grid md:grid-cols-2 gap-5">
      {ordered.map((u) => {
        const state = states[u.id];
        const isRecommended = recommended.includes(u.id);
        if (u.comingSoon) {
          return (
            <article key={u.id} className="surface p-6 flex flex-col" style={{ background: "var(--muted)" }} aria-label={`${u.question} (coming soon)`}>
              <div className="flex items-center gap-2 mb-3">
                <Pill tone="neutral">Coming soon</Pill>
              </div>
              <h2 className="font-display text-2xl leading-tight" style={{ color: "var(--foreground)" }}>{u.question}</h2>
              <p className="mt-3 text-base" style={{ color: "var(--muted-foreground)" }}>{u.description}</p>
              <p className="mt-auto pt-6 text-sm" style={{ color: "var(--muted-foreground)" }}>Not available to start yet.</p>
            </article>
          );
        }
        const cta = state === "active" ? "Open your assessment" : state === "started" ? "Continue" : "Start with a free Snapshot";
        return (
          <article
            key={u.id}
            className="surface p-6 flex flex-col hover:shadow-md"
            style={{ borderColor: isRecommended ? "var(--green)" : undefined, boxShadow: isRecommended ? "0 0 0 1px var(--green)" : undefined }}
          >
            {(isRecommended || state) && (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {isRecommended && <Pill tone="green">Recommended for you</Pill>}
                {state === "active" && <Pill tone="green">Purchased</Pill>}
                {state === "started" && <Pill tone="amber">In progress</Pill>}
              </div>
            )}
            <h2 className="font-display text-2xl leading-tight" style={{ color: "var(--foreground)" }}>{u.question}</h2>
            <dl className="mt-4 space-y-3 text-base">
              <div>
                <dt className="label">Use it when</dt>
                <dd style={{ color: "var(--foreground)" }}>{u.forWho}</dd>
              </div>
              <div>
                <dt className="label">You&apos;ll decide</dt>
                <dd style={{ color: "var(--foreground)" }}>{u.decision}</dd>
              </div>
            </dl>
            <div className="mt-auto pt-6 flex items-center justify-between gap-3 flex-wrap">
              <Link href={hrefFor(u.id)} className={`btn ${state === "active" || isRecommended ? "btn-primary" : "btn-secondary"}`} aria-label={`${cta}: ${u.question}`}>
                {cta} →
              </Link>
              {price !== null && price !== undefined && (
                <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {sellable?.includes(u.id) ? `Snapshot free · Assessment ${price}` : "Snapshot free · Assessment coming soon"}
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
