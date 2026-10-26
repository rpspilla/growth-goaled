import Link from "next/link";
import type { UseCaseDef } from "@/lib/use-cases";

export type CardState = "active" | "started" | null;

/** Library cards: the founder's question, when it's useful, what you get. */
export function UseCaseCards({
  useCases,
  recommended,
  states,
  hrefFor,
}: {
  useCases: readonly UseCaseDef[];
  recommended: readonly string[];
  states: Record<string, CardState>;
  hrefFor: (id: string) => string;
}) {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {useCases.map((u) => {
        const state = states[u.id];
        return (
          <Link
            key={u.id}
            href={hrefFor(u.id)}
            className="rounded-xl border p-5 flex flex-col hover:shadow-sm transition-shadow"
            style={{ background: "var(--card)", borderColor: recommended.includes(u.id) ? "var(--green)" : "var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-2 min-h-5">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{u.shortTitle}</span>
              {recommended.includes(u.id) && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--green-muted)", color: "var(--green)" }}>Recommended</span>
              )}
              {state === "active" && <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--green)", color: "#fff" }}>Active</span>}
              {state === "started" && <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--amber-muted)", color: "var(--amber)" }}>Objective started</span>}
            </div>
            <div className="font-display text-xl mb-2" style={{ color: "var(--foreground)" }}>{u.question}</div>
            <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>{u.whenUseful}</p>
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--foreground)" }}>What you get</div>
            <ul className="text-xs space-y-0.5 mb-4" style={{ color: "var(--muted-foreground)" }}>
              {u.youGet.map((g) => <li key={g}>• {g}</li>)}
            </ul>
            <span className="mt-auto text-sm font-semibold" style={{ color: "var(--green)" }}>
              {state === "active" ? "View objective →" : state === "started" ? "Continue →" : "Choose this →"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
