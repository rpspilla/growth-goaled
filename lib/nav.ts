import type { NavItem } from "@/components/shell/UseCaseSidebar";
import type { StepState } from "@/lib/use-cases/steps";

/** The founder menu, in the owner's order (Nov 12, 2026 call). The advisor's company view mirrors it. */
export const NAV_LABELS = ["Company Details", "Team", "Overview", "Growth Projects", "Performance", "Documents", "What's Next?"] as const;

/** Where "What's Next?" lives (it was "Strategic Growth Questions" at /chat, which redirects here). */
export const WHATS_NEXT = "/whats-next";

/** The founder's menu; `steps` (the active growth project's Data, Results and Action plan) sit under Growth Projects. */
export function founderNav(steps: StepState[]): NavItem[] {
  const [details, team, overview, projects, performance, documents, next] = NAV_LABELS;
  return [
    { href: "/profile", label: details },
    { href: "/team", label: team },
    { href: "/overview", label: overview },
    { href: "/library", label: projects, steps },
    { href: "/performance", label: performance },
    { href: "/documents", label: documents },
    { href: WHATS_NEXT, label: next },
  ];
}

/**
 * The same menu on the advisor's view of a company. Items without their own advisor page open the
 * matching section of the company page; the steps open the advisor's copies of the founder's pages.
 */
export function advisorNav(companyId: string, steps: StepState[]): NavItem[] {
  const base = `/advisor/companies/${companyId}`;
  const [details, team, overview, projects, performance, documents, next] = NAV_LABELS;
  const section = (id: string) => ({ href: `${base}#${id}`, match: `${base}#${id}` });
  return [
    { ...section("details"), label: details },
    { ...section("people"), label: team },
    { href: base, label: overview, exact: true },
    { href: `${base}/library`, label: projects, steps: steps.map((s) => ({ ...s, path: `${base}${s.path}` })) },
    { ...section("business-updates"), label: performance },
    { href: `${base}/documents`, label: documents },
    { ...section("whats-next"), label: next },
  ];
}
