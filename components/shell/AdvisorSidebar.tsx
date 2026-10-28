"use client";

// Client component: NavLink takes a render function, which cannot cross the server/client boundary.
import { NavLink } from "./NavLink";
import { initials } from "./initials";

const ADVISOR_NAV = [
  { href: "/advisor/portfolio", label: "Portfolio" },
  { href: "/advisor/unassigned", label: "Unassigned", badgeKey: "unassigned" },
  { href: "/advisor/review", label: "Review Queue", badgeKey: "review" },
  { href: "/advisor/benchmark-library", label: "Benchmark Library" },
  { href: "/advisor/rubrics", label: "Score Rubrics" },
  { href: "/advisor/registers", label: "Registers" },
  { href: "/advisor/settings", label: "Settings" },
] as const;

const ADMIN_NAV = [
  { href: "/advisor/users", label: "Users" },
  { href: "/advisor/analytics", label: "Analytics" },
] as const;

export type AdvisorBadges = { unassigned: number; review: number };

export function AdvisorSidebar({
  badges,
  name,
  email,
  role,
}: {
  badges: AdvisorBadges;
  name: string | null;
  email: string;
  role: "advisor" | "admin";
}) {
  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {[...ADVISOR_NAV, ...(role === "admin" ? ADMIN_NAV : [])].map((item) => {
          const badge = "badgeKey" in item ? badges[item.badgeKey] : 0;
          return (
            <NavLink key={item.href} href={item.href}>
              {() => (
                <>
                  <span className="flex-1 font-medium">{item.label}</span>
                  {badge > 0 && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                      style={{ background: "var(--green)", color: "#fff", fontSize: "10px" }}
                    >
                      {badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-4 pb-5 pt-3 border-t" style={{ borderColor: "#1E3347" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: "rgba(21,90,60,0.4)", color: "#6EE7A8" }}
          >
            {initials(name, email)}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-white truncate">{name || email}</div>
            <div className="text-xs" style={{ color: "#5A7A96" }}>{role === "admin" ? "Admin" : "Advisor"}</div>
          </div>
        </div>
      </div>
    </>
  );
}
