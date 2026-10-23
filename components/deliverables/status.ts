export const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  drafting: { label: "Drafting", color: "var(--amber)" },
  qa: { label: "QA running", color: "var(--amber)" },
  in_review: { label: "Review now", color: "var(--red)" },
  approved: { label: "Approved · not published", color: "var(--green)" },
  published: { label: "Published", color: "var(--green)" },
  changes_requested: { label: "Superseded", color: "var(--muted-foreground)" },
  failed: { label: "Failed", color: "var(--red)" },
  stalled: { label: "Stalled", color: "var(--red)" },
};
