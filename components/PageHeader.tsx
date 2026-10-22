import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
          {eyebrow}
        </div>
      )}
      <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
        {title}
      </h1>
      {subtitle && (
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
