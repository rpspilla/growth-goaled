import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { StatusChip } from "@/components/visual/primitives";
import { QuestionIllustration } from "@/components/visual/QuestionIllustration";
import type { UseCaseDef } from "@/lib/use-cases";
import { visualFor } from "@/lib/use-cases/visual";

export type CardState = "active" | "started" | null;

/**
 * The library: each card is a question the founder is facing: an illustration, the question, one
 * line on when to use it and the 2–3 questions it answers. Nothing else (owner decision, Nov 2026).
 * Cards keep the library order; coming-soon questions go last.
 */
export function UseCaseCards({
  useCases,
  states,
  hrefFor,
  price,
  sellable,
  extra,
}: {
  useCases: readonly UseCaseDef[];
  states: Record<string, CardState>;
  hrefFor: (id: string) => string;
  /** Formatted assessment price, or null where prices aren't shown (advisor view). */
  price?: string | null;
  sellable?: readonly string[];
  /** A last card after the questions (the founder library's "Don't see what you're looking for?"). */
  extra?: React.ReactNode;
}) {
  // Library order, "Coming soon" last.
  const ordered = [...useCases].sort((a, b) => Number(Boolean(a.comingSoon)) - Number(Boolean(b.comingSoon)));
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {ordered.map((u) => {
        const v = visualFor(u.id);
        const state = states[u.id];
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
          <article key={u.id} className="surface p-4 flex flex-col gap-3 relative hover:shadow-md transition-shadow">
            <div className="relative">
              <QuestionIllustration id={u.id} className="h-28" />
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
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>Use it when: </span>
              {v.oneLine}
            </p>
            {u.answers && (
              <ul className="text-sm space-y-1" aria-label="Questions it answers" style={{ color: "var(--foreground)" }}>
                {u.answers.map((q) => (
                  <li key={q} className="flex gap-2">
                    <Check size={15} className="shrink-0 mt-0.5" style={{ color: "var(--green)" }} aria-hidden />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto pt-2 flex items-center justify-between gap-2 flex-wrap">
              <Link href={hrefFor(u.id)} className={`btn ${state === "active" ? "btn-primary" : "btn-secondary"}`} aria-label={`${cta}: ${u.question}`}>
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
      {extra}
    </div>
  );
}
