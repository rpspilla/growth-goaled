"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/** Below the md breakpoint the sidebar collapses into this menu; it closes after each navigation. */
export function MobileNav({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  return (
    <details ref={ref} className="md:hidden mr-3 shrink-0">
      <summary className="list-none cursor-pointer w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--navy)", color: "#fff" }} aria-label="Menu">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="fixed left-0 right-0 bottom-0 top-16 z-40 flex flex-col overflow-y-auto" style={{ background: "var(--navy)", color: "#C8D3E0" }}>
        {children}
      </div>
    </details>
  );
}
