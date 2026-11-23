import type { RecommendationCard } from "@/lib/db/schema";
import { addDays } from "@/lib/weeks";

/** At most this many commitments from one decision card. */
export const MAX_COMMITMENTS = 5;

export type CommitmentDraft = { title: string; owner: string; dueOn: string | null; measure: string | null };

/**
 * What "Commit to this" proposes from a decision card: its next steps (up to five) as commitments,
 * owned by the founder, a week apart from today, each with the matching success measure if the card
 * gives one. The founder edits before saving.
 */
export function proposeCommitments(card: Pick<RecommendationCard, "nextSteps" | "successMeasures">, owner: string, today: string): CommitmentDraft[] {
  return card.nextSteps.slice(0, MAX_COMMITMENTS).map((title, i) => ({ title, owner, dueOn: addDays(today, 7 * (i + 1)), measure: card.successMeasures[i] ?? null }));
}

/** A project name from the card's takeaway: its first clause, short enough for a heading. */
export function projectNameFrom(takeaway: string, fallback: string): string {
  const first = takeaway.split(/[.;:—–]/)[0]!.trim();
  const name = first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
  return name || fallback.slice(0, 80);
}

export const OUTCOMES = { worked: "Worked", partly: "Partly worked", didnt: "Didn't work" } as const;

/** Overdue: open and due before today. */
export const isOverdue = (c: { status: string; dueOn: string | null }, today: string) => c.status === "open" && c.dueOn !== null && c.dueOn < today;

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Rows for the commitments list (Overview, project page, advisor). */
export function commitmentItems(
  rows: { id: string; title: string; owner: string; dueOn: string | null; measure: string | null; status: "open" | "done" | "dropped"; projectId: string; conversationId: string | null; outcome?: "worked" | "partly" | "didnt" | null; outcomeNote?: string | null }[],
  projects: Map<string, string>,
  today: string,
  opts: { withProject?: boolean } = {},
): import("@/components/projects/CommitmentList").CommitmentItem[] {
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    owner: c.owner,
    dueLabel: c.dueOn ? dayLabel(c.dueOn) : null,
    overdue: isOverdue(c, today),
    measure: c.measure,
    status: c.status,
    project: opts.withProject !== false && projects.has(c.projectId) ? { id: c.projectId, name: projects.get(c.projectId)! } : null,
    conversationId: c.conversationId,
    outcome: c.outcome ?? null,
    outcomeNote: c.outcomeNote ?? null,
  }));
}
