import type { DataItemState, DimensionView } from "@/components/views/AssessmentResults";
import type { Company } from "@/lib/db/schema";
import { getItem, type ItemStatus } from "@/lib/readiness";
import type { UseCaseDef } from "@/lib/use-cases/types";
import { getReadiness } from "./readiness";

const STATE: Record<ItemStatus, DataItemState> = {
  available: "in",
  partial: "partial",
  missing: "missing",
  not_reviewed: "not_shared",
  not_applicable: "not_applicable",
};

/** The use case's plan dimensions with where each one's data stands, linked to where it's updated. */
export async function dimensionViews(company: Company, def: UseCaseDef, dataHref: string): Promise<DimensionView[] | undefined> {
  if (!def.dimensions?.length) return undefined;
  const { items } = await getReadiness(company);
  const status = new Map(items.map((i) => [i.itemKey, i.status]));
  return def.dimensions.map((d) => ({
    id: d.id,
    title: d.title,
    summary: d.summary,
    items: d.items.flatMap((key) => {
      const item = getItem(key);
      return item ? [{ key, name: item.name, state: STATE[status.get(key) ?? "not_reviewed"], href: `${dataHref}#item-${key}` }] : [];
    }),
  }));
}
