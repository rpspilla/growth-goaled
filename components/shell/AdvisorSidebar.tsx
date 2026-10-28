"use client";

// Client component: NavLink takes a render function, which cannot cross the server/client boundary.
import { NavLink } from "./NavLink";
import { initials } from "./initials";

type Item = { href: string; label: string; badgeKey?: keyof AdvisorBadges };

/** Grouped by job: client work first, then the reference data behind it, then admin. */
const ADVISOR_NAV: { title: string; items: Item[] }[] = [
  {
    title: "Clients",
    items: [
      { href: "/advisor/portfolio", label: "Portfolio" },
      { href: "/advisor/review", label: "Review queue", badgeKey: "review" },
      { href: "/advisor/unassigned", label: "Unassigned", badgeKey: "unassigned" },
      { href: "/advisor/registers", label: "Registers" },
    ],
  },
  {
    title: "Method",
    items: [
      { href: "/advisor/benchmark-library", label: "Benchmark library" },
      { href: "/advisor/rubrics", label: "Score rubrics" },
      { href: "/advisor/settings", label: "Settings" },
    ],
  },
];

const ADMIN_NAV: { title: string; items: Item[] } = {
  title: "Admin",
  items: [
    { href: "/advisor/users", label: "Users" },
    { href: "/advisor/analytics", label: "Analytics" },
  ],
};

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
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Advisor">
        {[...ADVISOR_NAV, ...(role === "admin" ? [ADMIN_NAV] : [])].map((group) => (
          <div key={group.title}>
            <div className="px-3 mb-1.5 text-sm font-semibold" style={{ color: "#8FA8BF" }}>{group.title}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                return (
                  <NavLink key={item.href} href={item.href}>
                    {() => (
                      <>
                        <span className="flex-1 font-medium">{item.label}</span>
                        {badge > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--green)", color: "#fff" }} aria-label={`${badge} waiting`}>
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 pb-5 pt-3 border-t" style={{ borderColor: "#1E3347" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: "rgba(21,90,60,0.4)", color: "#6EE7A8" }}
          >
            {initials(name, email)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">{name || email}</div>
            <div className="text-sm" style={{ color: "#8FA8BF" }}>{role === "admin" ? "Admin" : "Advisor"}</div>
          </div>
        </div>
      </div>
    </>
  );
}
