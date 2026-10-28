"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Sidebar link; `children` receives the active flag. The current page is marked for screen readers too. */
export function NavLink({
  href,
  match = href,
  exact = false,
  children,
}: {
  href: string;
  match?: string;
  exact?: boolean;
  children: (active: boolean) => ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === match || (exact ? false : pathname.startsWith(`${match}/`));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left group hover:bg-white/5"
      style={{
        background: active ? "rgba(255,255,255,0.08)" : undefined,
        color: active ? "#fff" : "#A9B8C8",
        boxShadow: active ? "inset 3px 0 0 #3DDC97" : undefined,
      }}
    >
      {children(active)}
    </Link>
  );
}
