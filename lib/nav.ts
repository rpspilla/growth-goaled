import type { NavItem } from "@/components/shell/UseCaseSidebar";

/**
 * The founder menu (Founder View redesign, Nov 16, 2026; AI CRO sprint, Nov 23, 2026: the
 * conversation comes first). Results and the action plan live inside each growth project; Data is one
 * shared place. The advisor's company view mirrors it.
 */
export const NAV_LABELS = ["Rally", "Company Details", "Team", "Overview", "Growth Projects", "Data", "Performance", "Documents"] as const;

/** Where "Ask your CRO" lives (it was "What's Next?", and before that "Strategic Growth Questions" at /chat, which redirects here). */
export const WHATS_NEXT = "/whats-next";

/** Growth projects: the history of the advisor's work, each with its plan, documents and results. */
export const PROJECTS = "/projects";

/** The company pages under "Your company" in the Rally rail (everything but the conversation). */
export function founderCompanyNav(): NavItem[] {
  return [...founderNav().slice(1), { href: "/cros", label: "Our CROs" }];
}

export function founderNav(): NavItem[] {
  const [ask, details, team, overview, projects, data, performance, documents] = NAV_LABELS;
  return [
    { href: WHATS_NEXT, label: ask },
    { href: "/profile", label: details },
    { href: "/team", label: team },
    { href: "/overview", label: overview },
    { href: PROJECTS, label: projects },
    { href: "/data", label: data },
    { href: "/performance", label: performance },
    { href: "/documents", label: documents },
  ];
}

/**
 * The same menu on the advisor's view of a company. Items without their own advisor page open the
 * matching section of the company page.
 */
export function advisorNav(companyId: string): NavItem[] {
  const base = `/advisor/companies/${companyId}`;
  const [, details, team, overview, projects, data, performance, documents] = NAV_LABELS;
  const section = (id: string) => ({ href: `${base}#${id}`, match: `${base}#${id}` });
  return [
    // The founder's conversations with their AI CRO, on the company page
    { ...section("whats-next"), label: "Conversations" },
    { ...section("details"), label: details },
    { ...section("people"), label: team },
    { href: base, label: overview, exact: true },
    { href: `${base}/projects`, label: projects },
    { href: `${base}/data`, label: data },
    { ...section("business-updates"), label: performance },
    { href: `${base}/documents`, label: documents },
  ];
}
