import type { Assessment } from "@/lib/readiness-assessment";
import { getItem, ITEM_STATUS_LABEL, type ItemStatus } from "@/lib/readiness";

const name = (key: string) => getItem(key)?.name ?? key;

/** The recorded facts an AI summary may use: names instead of keys, nothing estimated. */
export function readinessFacts(a: Assessment, statuses: Record<string, ItemStatus>) {
  return {
    collection: {
      required_items_supplied_percent: a.collection.requiredPercent,
      items_reviewed: `${a.collection.reviewed} of ${a.collection.total}`,
      by_category: a.collection.byCategory.map((c) => ({
        category: c.name,
        required_supplied_percent: c.requiredPercent,
        required_items_missing: c.missingRequired,
      })),
    },
    items: {
      available_and_complete: a.gaps.complete.map(name),
      incomplete: a.gaps.incomplete.map((k) => ({ item: name(k), status: ITEM_STATUS_LABEL[statuses[k] ?? "not_reviewed"] })),
      missing: a.gaps.missing.map(name),
      not_reviewed_yet: a.gaps.notReviewed.map(name),
      outdated_or_short_history: a.gaps.outdated.map(name),
    },
    quality: {
      items_supplied: a.quality.supplied,
      validated_by_advisor: a.quality.validated,
      unverified: a.quality.unverified,
      estimated: a.quality.estimated,
      issues: a.quality.issues.map((i) => ({ item: name(i.key), issue: i.detail })),
      conflicts_between_sources: a.gaps.conflicting,
    },
    metrics: a.analytical.map((m) => ({
      metric: m.label,
      can_calculate: m.state === "ready" ? "yes" : m.state === "limited" ? "with limitations" : "not yet",
      blocked_by: m.blockedBy.map(name),
      limited_by: m.limitedBy.map(name),
      note: m.message,
    })),
    next_most_useful_request: a.nextRequest ? { item: name(a.nextRequest.key), request: a.nextRequest.request } : null,
  };
}
