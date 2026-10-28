import type { ReactNode } from "react";

/** What's missing, why it matters, and the one thing to do about it. */
export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="surface surface-pad text-center max-w-xl mx-auto">
      <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>{title}</div>
      {body && <p className="text-base mt-1.5" style={{ color: "var(--muted-foreground)" }}>{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
