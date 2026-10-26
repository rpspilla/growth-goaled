"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The Data step's tabs: what the use case needs, uploaded files, and open questions. */
export function ReadinessTabs({ questions = 0 }: { questions?: number }) {
  const path = usePathname();
  const tabs = [
    { href: "/data", label: "What we need", badge: 0 },
    { href: "/data/files", label: "Files", badge: 0 },
    { href: "/data/questions", label: "Needs your answer", badge: questions },
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto border-b mb-8" style={{ borderColor: "var(--border)" }}>
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors"
            style={{
              borderColor: active ? "var(--green)" : "transparent",
              color: active ? "var(--foreground)" : "var(--muted-foreground)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="ml-1.5 text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--amber)" }}>
                {t.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
