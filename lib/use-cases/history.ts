import type { UseCaseId } from "./types";

type UseCaseRow = {
  useCase: string;
  status: "objective" | "active" | "baseline_in_review" | "tracking" | "closed";
  activatedAt: Date | null;
  activation: "paid" | "advisor" | null;
  createdAt: Date;
};
type PaymentRow = { useCase: string | null; status: "pending" | "paid" | "expired" | "failed"; createdAt: Date };

export type HistoryEntry = {
  useCase: UseCaseId;
  purchase: "Purchased" | "Granted by your advisor" | "Payment pending" | "Payment didn't complete" | "Not purchased";
  assessment: "Snapshot only" | "Collecting data" | "Being analyzed" | "Preliminary results" | "Complete" | "Closed";
  createdAt: Date;
  completedAt: Date | null;
  /** Where "View" goes: results once purchased, otherwise the Snapshot. */
  href: string;
};

/**
 * One line per assessment the company has started, newest first. `completed` maps a use case
 * to when its reviewed results were published; `preliminary` lists use cases with results shown early.
 */
export function assessmentHistory(
  rows: readonly UseCaseRow[],
  payments: readonly PaymentRow[],
  completed: Readonly<Partial<Record<string, Date>>>,
  preliminary: readonly string[],
  isUseCase: (id: string) => id is UseCaseId,
): HistoryEntry[] {
  return rows
    .filter((r): r is UseCaseRow & { useCase: UseCaseId } => isUseCase(r.useCase))
    .map((r) => {
      const latest = payments.filter((p) => p.useCase === r.useCase).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const purchase: HistoryEntry["purchase"] = r.activatedAt
        ? r.activation === "advisor"
          ? "Granted by your advisor"
          : "Purchased"
        : latest?.status === "pending"
          ? "Payment pending"
          : latest && latest.status !== "paid"
            ? "Payment didn't complete"
            : "Not purchased";
      const completedAt = r.activatedAt ? (completed[r.useCase] ?? null) : null;
      const assessment: HistoryEntry["assessment"] = !r.activatedAt
        ? "Snapshot only"
        : r.status === "closed"
          ? "Closed"
          : completedAt || r.status === "tracking"
            ? "Complete"
            : preliminary.includes(r.useCase)
              ? "Preliminary results"
              : r.status === "baseline_in_review"
                ? "Being analyzed"
                : "Collecting data";
      return { useCase: r.useCase, purchase, assessment, createdAt: r.createdAt, completedAt, href: r.activatedAt ? `/assessments/open?use_case=${r.useCase}` : `/library/${r.useCase}/snapshot` };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
