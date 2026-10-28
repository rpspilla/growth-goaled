import Link from "next/link";
import type { ReactNode } from "react";
import { isStaging } from "@/lib/env";
import { signOut } from "./actions";
import { initials } from "./initials";
import { MobileNav } from "./MobileNav";

/** Two-column app frame from the prototype: navy sidebar + top bar + scrolling content. */
export function Shell({ sidebar, topbar, children }: { sidebar: ReactNode; topbar: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden md:flex flex-col w-64 shrink-0 h-full" style={{ background: "var(--navy)", color: "#C8D3E0" }}>
        <div className="px-5 pt-6 pb-5 border-b" style={{ borderColor: "#1E3347" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
              style={{ background: "var(--green)", color: "#fff" }}
            >
              G
            </div>
            <div className="leading-tight">
              <div className="font-semibold text-white text-base tracking-tight">Growth Goaled</div>
              <div className="text-xs" style={{ color: "#8FA3B8" }}>Your Seed &amp; Series A CRO</div>
            </div>
          </div>
        </div>
        {sidebar}
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header
          className="flex items-center h-16 px-4 md:px-8 border-b shrink-0 min-w-0"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <MobileNav>{sidebar}</MobileNav>
          <div className="flex items-center flex-1 min-w-0 gap-2">{topbar}</div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="page-enter">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function StagingBadge() {
  if (!isStaging()) return null;
  return (
    <span
      className="font-mono text-xs font-semibold px-2 py-0.5 rounded tracking-wider"
      style={{ background: "var(--amber-muted)", color: "var(--amber)", fontSize: "10px" }}
    >
      STAGING
    </span>
  );
}

export function UserMenu({ name, email, color, profileHref }: { name: string | null; email: string; color: "navy" | "green"; profileHref?: string }) {
  return (
    <div className="flex items-center gap-3">
      {profileHref && (
        <Link href={profileHref} className="text-sm whitespace-nowrap hover:underline" style={{ color: "var(--muted-foreground)" }}>
          <span className="hidden sm:inline">Company </span>profile
        </Link>
      )}
      <div
        title={email}
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: color === "navy" ? "var(--navy)" : "var(--green)", color: "#fff" }}
      >
        {initials(name, email)}
      </div>
      <form action={signOut}>
        <button type="submit" className="text-sm whitespace-nowrap hover:underline" style={{ color: "var(--muted-foreground)" }}>
          Sign out
        </button>
      </form>
    </div>
  );
}
