import type { ReactNode } from "react";

/** Page title block: optional context label, a clear title, one line of explanation, optional actions. */
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end gap-4">
      <div className="flex-1 min-w-0">
        {eyebrow && <div className="label mb-2">{eyebrow}</div>}
        <h1 className="font-display text-3xl sm:text-4xl font-normal" style={{ color: "var(--foreground)", letterSpacing: "-0.01em" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-base sm:text-lg mt-2 max-w-2xl" style={{ color: "var(--muted-foreground)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
    </div>
  );
}
