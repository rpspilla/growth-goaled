import Link from "next/link";
import type { UseCaseDef } from "@/lib/use-cases";

export type CardState = "active" | "started" | null;

/** Library cards: the founder's question, the problem, who it's for, key outputs, and what it costs. */
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
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {useCases.map((u) => {
        const state = states[u.id];
        return (
          <article
            key={u.id}
            className="rounded-xl border p-5 flex flex-col"
            style={{ background: "var(--card)", borderColor: recommended.includes(u.id) ? "var(--green)" : "var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-2 min-h-5 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{u.shortTitle}</span>
              {recommended.includes(u.id) && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--green-muted)", color: "var(--green)" }}>Recommended</span>
              )}
              {state === "active" && <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--green)", color: "#fff" }}>Purchased</span>}
              {state === "started" && <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--amber-muted)", color: "var(--amber)" }}>Started</span>}
            </div>
            <h2 className="font-display text-xl mb-2" style={{ color: "var(--foreground)" }}>{u.question}</h2>
            <p className="text-sm mb-2" style={{ color: "var(--muted-foreground)" }}>{u.description}</p>
            <p className="text-xs mb-3" style={{ color: "var(--foreground)" }}><span className="font-semibold">For: </span>{u.forWho}</p>
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--foreground)" }}>Key outputs</div>
            <ul className="text-xs space-y-0.5 mb-4" style={{ color: "var(--muted-foreground)" }}>
              {u.youGet.slice(0, 4).map((g) => <li key={g}>• {g}</li>)}
            </ul>
            <div className="mt-auto flex items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
              {price !== null && price !== undefined ? (
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Free Snapshot · {sellable?.includes(u.id) ? `Assessment ${price}` : "Assessment coming soon"}
                </span>
              ) : <span />}
              <Link href={hrefFor(u.id)} className="text-sm font-semibold shrink-0" style={{ color: "var(--green)" }} aria-label={`Explore assessment: ${u.question}`}>
                {state === "active" ? "Open →" : "Explore assessment →"}
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
