import type { ReactNode } from "react";

/** A titled block of a page. One idea per section: a heading, an optional one-line lead, the content. */
export function Section({ id, title, lead, aside, children, className = "" }: { id?: string; title: ReactNode; lead?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={className}>
      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 id={id} className="text-xl sm:text-2xl font-semibold" style={{ color: "var(--foreground)", letterSpacing: "-0.01em" }}>{title}</h2>
          {lead && <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>{lead}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
