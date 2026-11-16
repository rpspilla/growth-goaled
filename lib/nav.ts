import type { NavItem } from "@/components/shell/UseCaseSidebar";

/**
 * The founder menu (Founder View redesign, Nov 16, 2026). Results and the action plan live inside
 * each growth project; Data is one shared place. The advisor's company view mirrors it.
 */
export const NAV_LABELS = ["Company Details", "Team", "Overview", "Growth Projects", "Data", "Performance", "Documents", "What's Next?"] as const;

/** Where "What's Next?" lives (it was "Strategic Growth Questions" at /chat, which redirects here). */
export const WHATS_NEXT = "/whats-next";

/** Growth projects: the history of the advisor's work, each with its plan, documents and results. */
export const PROJECTS = "/projects";

export function founderNav(): NavItem[] {
  const [details, team, overview, projects, data, performance, documents, next] = NAV_LABELS;
  return [
    { href: "/profile", label: details },
    { href: "/team", label: team },
    { href: "/overview", label: overview },
    { href: PROJECTS, label: projects },
    { href: "/data", label: data },
    { href: "/performance", label: performance },
    { href: "/documents", label: documents },
    { href: WHATS_NEXT, label: next },
  ];
}

/**
 * The same menu on the advisor's view of a company. Items without their own advisor page open the
 * matching section of the company page.
 */
export function advisorNav(companyId: string): NavItem[] {
  const base = `/advisor/companies/${companyId}`;
  const [details, team, overview, projects, data, performance, documents, next] = NAV_LABELS;
  const section = (id: string) => ({ href: `${base}#${id}`, match: `${base}#${id}` });
  return [
    { ...section("details"), label: details },
    { ...section("people"), label: team },
    { href: base, label: overview, exact: true },
    { href: `${base}/projects`, label: projects },
    { href: `${base}/data`, label: data },
    { ...section("business-updates"), label: performance },
    { href: `${base}/documents`, label: documents },
    { ...section("whats-next"), label: next },
  ];
}
