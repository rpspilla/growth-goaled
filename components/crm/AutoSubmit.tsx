"use client";

import type { ReactNode } from "react";

/** A GET filter form that applies as soon as a control changes (search applies on Enter). */
export function AutoSubmit({ children, label }: { children: ReactNode; label: string }) {
  return (
    <form method="get" aria-label={label} className="flex flex-wrap gap-2 items-center" onChange={(e) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "SELECT") (e.currentTarget as HTMLFormElement).requestSubmit();
    }}>
      {children}
    </form>
  );
}
