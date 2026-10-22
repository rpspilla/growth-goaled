"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Sidebar link with the prototype's active styling; `children` receives the active flag. */
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
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-all group"
      style={{
        background: active ? "rgba(21,90,60,0.25)" : "transparent",
        color: active ? "#fff" : "#7A98B4",
      }}
    >
      {children(active)}
    </Link>
  );
}
