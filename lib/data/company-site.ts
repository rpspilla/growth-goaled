import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { fetchSiteProfile, siteUrl, type SiteProfile } from "@/lib/site-profile";

const REFRESH_DAYS = 14;

async function refresh(company: Pick<Company, "id" | "website">, keep: SiteProfile | null): Promise<SiteProfile> {
  const found = await fetchSiteProfile(company.website!).catch(() => null);
  const next = { logoUrl: found?.logoUrl ?? keep?.logoUrl ?? null, about: found?.about ?? keep?.about ?? null };
  await db.update(schema.companies).set({ siteUrl: company.website, siteCheckedAt: new Date(), ...next }).where(eq(schema.companies.id, company.id));
  return next;
}

/**
 * The company's logo and what it does, read from its website. Read once when the website is first
 * known or changes (a few seconds at most), then kept and refreshed in the background every two weeks.
 */
export async function companySite(company: Pick<Company, "id" | "website" | "siteUrl" | "logoUrl" | "about" | "siteCheckedAt">): Promise<SiteProfile & { website: string | null }> {
  const url = siteUrl(company.website);
  if (!url) return { logoUrl: null, about: null, website: null };
  const website = url.host.replace(/^www\./, "");
  if (company.siteUrl !== company.website || !company.siteCheckedAt) return { ...(await refresh(company, null)), website };
  const cached = { logoUrl: company.logoUrl, about: company.about };
  if (Date.now() - company.siteCheckedAt.getTime() > REFRESH_DAYS * 86_400_000) after(() => refresh(company, cached));
  return { ...cached, website };
}
