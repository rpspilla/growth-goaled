import { getItem } from "@/lib/readiness";
import type { UseCaseDef } from "@/lib/use-cases";

/** The data a use case needs: required items (bold) first, then those that sharpen it, then extras. */
export function DataNeeded({ useCase }: { useCase: UseCaseDef }) {
  const groups = [
    { title: "Needed for the baseline", keys: useCase.requiredItems, bold: true },
    { title: "Sharpens it", keys: useCase.helpfulItems, bold: false },
    { title: "Optional extras", keys: useCase.optionalItems, bold: false },
  ].filter((g) => g.keys.length);
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>{g.title}</div>
          <ul className="text-sm space-y-0.5">
            {g.keys.map((k) => (
              <li key={k} style={{ color: "var(--foreground)", fontWeight: g.bold ? 600 : 400 }}>{getItem(k)?.name ?? k}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
