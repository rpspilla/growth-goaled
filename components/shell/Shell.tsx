import type { ReactNode } from "react";
import { isStaging } from "@/lib/env";
import { signOut } from "./actions";
import { initials } from "./initials";

/** Two-column app frame from the prototype: navy sidebar + top bar + scrolling content. */
export function Shell({ sidebar, topbar, children }: { sidebar: ReactNode; topbar: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex flex-col w-56 shrink-0 h-full" style={{ background: "var(--navy)", color: "#C8D3E0" }}>
        <div className="px-5 pt-6 pb-5 border-b" style={{ borderColor: "#1E3347" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
              style={{ background: "var(--green)", color: "#fff" }}
            >
              G
            </div>
            <span className="font-semibold text-white text-sm tracking-tight">Growth Goaled</span>
          </div>
        </div>
        {sidebar}
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header
          className="flex items-center h-14 px-6 border-b shrink-0"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          {topbar}
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

export function UserMenu({ name, email, color }: { name: string | null; email: string; color: "navy" | "green" }) {
  return (
    <div className="flex items-center gap-3">
      <div
        title={email}
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: color === "navy" ? "var(--navy)" : "var(--green)", color: "#fff" }}
      >
        {initials(name, email)}
      </div>
      <form action={signOut}>
        <button type="submit" className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Sign out
        </button>
      </form>
    </div>
  );
}
