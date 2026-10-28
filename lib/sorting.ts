import type { FileProfile, SortSuggestion } from "@/lib/db/schema";
import { CATEGORIES, getItem } from "@/lib/readiness";
import { missingFieldsFor } from "@/lib/readiness-assessment";

/**
 * Rule-based half of "upload whatever you have": suggests readiness items from
 * spreadsheet columns and file names. The model adds suggestions from the
 * content; the founder confirms before anything is marked supplied.
 */

/** Items whose expected columns all appear in one sheet (items with at least two expected fields). */
export function suggestFromColumns(profile: FileProfile | null): SortSuggestion[] {
  if (!profile) return [];
  const out: SortSuggestion[] = [];
  for (const sheet of profile.sheets) {
    for (const item of CATEGORIES.flatMap((c) => c.items)) {
      if (!item.fields || item.fields.length < 2) continue;
      if (missingFieldsFor(item.key, [...sheet.columns, ...(sheet.labels ?? [])]).length === 0) {
        out.push({
          itemKey: item.key,
          sheet: profile.sheets.length > 1 ? sheet.name : null,
          confidence: "medium",
          reason: `Has the fields this needs (${item.fields.map((f) => f.label).join(", ")})`,
          source: "columns",
          status: "suggested",
        });
      }
    }
  }
  return out;
}

const NAME_HINTS: { pattern: RegExp; items: string[] }[] = [
  { pattern: /\b(p\s*&\s*l|pnl|profit|income statement|financials?)\b/i, items: ["monthly_revenue", "monthly_expenses"] },
  { pattern: /\b(cash ?flow|runway|bank)\b/i, items: ["cash_balances", "current_cash", "runway"] },
  { pattern: /\b(model|forecast|budget)\b/i, items: ["forecast_vs_actual"] },
  { pattern: /\b(customers?|accounts?|arr by|revenue by)\b/i, items: ["customer_list", "revenue_by_customer"] },
  { pattern: /\b(pipeline|opportunit|deals?|crm|hubspot|salesforce)\b/i, items: ["opportunities"] },
  { pattern: /\b(win.?loss)\b/i, items: ["win_loss"] },
  { pattern: /\b(marketing|ads?|campaigns?|leads?)\b/i, items: ["marketing_spend", "leads_by_source"] },
  { pattern: /\b(churn|retention|cohorts?|nrr|grr)\b/i, items: ["churn", "grr_nrr"] },
  { pattern: /\b(usage|activation|product analytics)\b/i, items: ["active_usage", "activation"] },
  { pattern: /\b(org ?chart|headcount|roster|team)\b/i, items: ["org_chart", "roster"] },
  { pattern: /\b(hiring|recruit)\b/i, items: ["open_roles", "hiring_dates_comp"] },
  { pattern: /\b(board|deck|investor update)\b/i, items: ["targets"] },
  { pattern: /\b(sales calls?|calls?|recordings?|transcripts?|gong|chorus|fathom|zoom)\b/i, items: ["sales_calls"] },
];

/** Low-confidence guesses from the file name, for files we can't read. */
export function suggestFromFilename(filename: string): SortSuggestion[] {
  const name = filename.replace(/[_\-.]+/g, " ");
  const keys = [...new Set(NAME_HINTS.filter((h) => h.pattern.test(name)).flatMap((h) => h.items))].filter((k) => getItem(k));
  return keys.map((itemKey) => ({ itemKey, sheet: null, confidence: "low", reason: "Based on the file name only", source: "filename", status: "suggested" }));
}

const RANK = { high: 3, medium: 2, low: 1 } as const;

/** One suggestion per item and sheet, keeping the strongest and noting when both methods agree. */
export function mergeSuggestions(...lists: SortSuggestion[][]): SortSuggestion[] {
  const out = new Map<string, SortSuggestion>();
  for (const s of lists.flat()) {
    if (!getItem(s.itemKey)) continue;
    const key = `${s.itemKey}|${s.sheet ?? ""}`;
    const prev = out.get(key);
    if (!prev) out.set(key, s);
    else if (prev.source !== s.source && (prev.source === "columns" || s.source === "columns")) {
      out.set(key, { ...(RANK[s.confidence] > RANK[prev.confidence] ? s : prev), confidence: "high", reason: `${prev.reason}; ${s.reason}` });
    } else if (RANK[s.confidence] > RANK[prev.confidence]) out.set(key, s);
  }
  const order = new Map(CATEGORIES.flatMap((c) => c.items.map((i) => i.key)).map((k, i) => [k, i]));
  return [...out.values()].sort((a, b) => (order.get(a.itemKey) ?? 0) - (order.get(b.itemKey) ?? 0));
}
