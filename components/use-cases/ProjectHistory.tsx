import Link from "next/link";
import { getUseCase } from "@/lib/use-cases";
import type { assessmentHistory } from "@/lib/use-cases/history";

const date = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

/** Every growth project the company has started or bought, and where each one stands. */
export function ProjectHistory({ entries }: { entries: ReturnType<typeof assessmentHistory> }) {
  return (
    <div className="surface overflow-x-auto">
      <table className="w-full text-base min-w-[640px]">
        <thead>
          <tr className="text-left text-sm" style={{ color: "var(--muted-foreground)", background: "var(--muted)" }}>
            {["Growth project", "Purchase", "Status", "Started", "Completed", ""].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.useCase} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="px-4 py-3 font-medium" style={{ color: "var(--foreground)" }}>{getUseCase(e.useCase)!.question}</td>
              <td className="px-4 py-3" style={{ color: e.purchase === "Purchased" || e.purchase === "Granted by your advisor" ? "var(--green)" : "var(--muted-foreground)" }}>{e.purchase}</td>
              <td className="px-4 py-3" style={{ color: "var(--foreground)" }}>{e.assessment}</td>
              <td className="px-4 py-3" style={{ color: "var(--muted-foreground)" }}>{date(e.createdAt)}</td>
              <td className="px-4 py-3" style={{ color: "var(--muted-foreground)" }}>{date(e.completedAt)}</td>
              <td className="px-4 py-3 text-right">
                <Link href={e.href} className="link">{e.purchase === "Purchased" || e.purchase === "Granted by your advisor" ? "Open" : "Snapshot"} →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
