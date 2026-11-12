import "server-only";
import { z } from "zod";
import { FIELD_KINDS } from "@/lib/plan-requests";

/**
 * Action plan items as founder inputs (Nov 12, 2026): the shape the model writes each founder item
 * in, and the rules it follows. Used by the conversation plan writer (lib/ai/plan.ts).
 */
export const requestSchema = z.object({
  action: z.string(),
  measure: z.string(),
  fields: z.array(z.object({ label: z.string(), kind: z.enum(FIELD_KINDS), hint: z.string().nullable() })),
  columns: z.array(z.string()),
});
export const FOUNDER_INPUT_RULES = `Every founder item asks the founder for specific data the plan needs, never for work to do:
- action: the request in plain words, naming the exact data and how it's split (e.g. "Enter your average deal cycle time in days, founder-closed and AE-closed").
- fields: each value the founder types, labelled as they'd see it (e.g. "Average deal cycle, founder-closed"), with kind: currency (US dollars), percent, days, number, text or date, and an optional short hint. 1 to 6 fields.
- columns: the exact columns a file must contain to answer it instead (e.g. a CRM export: "Deal name", "Owner", "Created date", "Close date", "Amount", "Stage"). 2 to 8 columns.
- measure: what the answer settles in the plan.
Work Growth Goaled does with the data (analysis, models, recommendations, reviews, building documents) is an advisor task, not a founder item.`;
