import "server-only";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { companyBlobPrefix } from "@/lib/data/documents";
import { getReadiness, type DataItemRow } from "@/lib/data/readiness";
import type { ItemRecord } from "@/components/readiness/ItemCard";

/** Loads the signed-in founder's own company and its readiness state; null when the company isn't set up. */
export async function loadReadiness() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) return null;
  const readiness = await getReadiness(company);
  return { user, company, readiness, blobPrefix: companyBlobPrefix(company.id) };
}

export function toRecord(row: DataItemRow | undefined): ItemRecord {
  return {
    status: row?.status ?? "not_reviewed",
    quality: row?.quality ?? "unverified",
    collectionMethod: row?.collectionMethod ?? null,
    sourceSystem: row?.sourceSystem ?? null,
    integrationRef: row?.integrationRef ?? null,
    coverageStart: row?.coverageStart ?? null,
    coverageEnd: row?.coverageEnd ?? null,
    limitations: row?.limitations ?? null,
    notes: row?.notes ?? null,
    followUp: row?.followUp ?? null,
    lastReviewedAt: row?.lastReviewedAt?.toISOString() ?? null,
  };
}
