"use client";

import { usePathname } from "next/navigation";
import { CompanyLogo } from "./CompanyLogo";

/**
 * The company's branding at the top of every founder page, in the Overview's format: logo, name,
 * what the company does and its website. The Overview has the full-size version, so it's left out there.
 */
export function CompanyBrandBar({ name, logoUrl, about, website, hideOn = ["/overview"] }: { name: string; logoUrl: string | null; about: string | null; website: string | null; /** Paths that already show the full-size version. */ hideOn?: string[] }) {
  const path = usePathname();
  if (hideOn.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return (
    <header aria-label={`${name} branding`} className="px-4 sm:px-8 pt-6 -mb-2 flex gap-4 items-center">
      <CompanyLogo name={name} src={logoUrl} size={48} />
      <div className="min-w-0 flex-1">
        <div className="font-display text-xl leading-tight truncate" style={{ color: "var(--foreground)" }}>{name}</div>
        {about && <p className="text-sm truncate max-w-3xl" style={{ color: "var(--muted-foreground)" }} title={about}>{about}</p>}
        {website && <a href={`https://${website}`} target="_blank" rel="noopener" className="link text-xs">{website}</a>}
      </div>
    </header>
  );
}
