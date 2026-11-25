"use client";

import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { CompanyLogo } from "./CompanyLogo";

// Collapsed or open, remembered in this browser (a per-viewer convenience; open when storage is unavailable).
const KEY = "rally-company-bar";
const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) === "collapsed";
  } catch {
    return false;
  }
};
const write = (collapsed: boolean) => {
  try {
    localStorage.setItem(KEY, collapsed ? "collapsed" : "open");
  } catch {}
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

/**
 * The company's branding at the top of founder company pages: logo, name, what the company does and its
 * website. Collapsible to one line (Nov 25, 2026). The Overview has the full-size version, so it's left out there.
 */
export function CompanyBrandBar({ name, logoUrl, about, website, hideOn = ["/overview"] }: { name: string; logoUrl: string | null; about: string | null; website: string | null; /** Paths that already show the full-size version. */ hideOn?: string[] }) {
  const path = usePathname();
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  if (hideOn.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  const toggle = (
    <button type="button" onClick={() => write(!collapsed)} aria-expanded={!collapsed} className="text-xs inline-flex items-center gap-1 shrink-0 link">
      {collapsed ? "Show company details" : "Hide"}
      <ChevronDown size={14} aria-hidden style={{ transform: collapsed ? "rotate(-90deg)" : undefined }} />
    </button>
  );
  if (collapsed) {
    return (
      <header aria-label={`${name} branding`} className="px-4 sm:px-8 pt-4 -mb-2 flex gap-3 items-center">
        <CompanyLogo name={name} src={logoUrl} size={24} />
        <span className="font-semibold text-sm truncate" style={{ color: "var(--foreground)" }}>{name}</span>
        {toggle}
      </header>
    );
  }
  return (
    <header aria-label={`${name} branding`} className="px-4 sm:px-8 pt-6 -mb-2 flex gap-4 items-center">
      <CompanyLogo name={name} src={logoUrl} size={48} />
      <div className="min-w-0 flex-1">
        <div className="font-display text-xl leading-tight truncate" style={{ color: "var(--foreground)" }}>{name}</div>
        {about && <p className="text-sm truncate max-w-3xl" style={{ color: "var(--muted-foreground)" }} title={about}>{about}</p>}
        {website && <a href={`https://${website}`} target="_blank" rel="noopener" className="link text-xs">{website}</a>}
      </div>
      {toggle}
    </header>
  );
}
