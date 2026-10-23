import { z } from "zod";

/** Register item types, in the order the registers view lists them. */
export const REGISTER_TYPES = [
  { id: "missing", label: "Missing information", badge: "Missing data", color: "var(--red)" },
  { id: "question", label: "Unresolved questions", badge: "Question", color: "var(--red)" },
  { id: "conflict", label: "Data conflicts", badge: "Data conflict", color: "var(--amber)" },
  { id: "assumption", label: "Assumptions", badge: "Assumption", color: "var(--blue)" },
  { id: "follow_up", label: "Follow-ups", badge: "Follow-up", color: "var(--muted-foreground)" },
] as const;

export type RegisterType = (typeof REGISTER_TYPES)[number]["id"];

export const registerTypeMeta = (t: RegisterType) => REGISTER_TYPES.find((r) => r.id === t)!;

/** What a person can do to close an item. Validated on the server. */
export const resolveActionSchema = z.discriminatedUnion("kind", [
  // Conflict: keep one of the item's values; the others are rejected.
  z.object({ kind: z.literal("choose"), dataPointId: z.uuid() }),
  // Assumption: the value we read is right.
  z.object({ kind: z.literal("confirm") }),
  // Replace the item's value(s) with the correct figure (same metric).
  z.object({ kind: z.literal("value"), value: z.number().finite().min(0), period: z.string().trim().max(40).optional() }),
  // Free-text answer (missing information, questions, follow-ups).
  z.object({ kind: z.literal("answer"), text: z.string().trim().min(1).max(2000) }),
  // Point at a file the company already uploaded.
  z.object({ kind: z.literal("document"), documentId: z.uuid() }),
  z.object({ kind: z.literal("unknown"), note: z.string().trim().max(2000).optional() }),
]);

export type ResolveAction = z.infer<typeof resolveActionSchema>;

export const newRegisterItemSchema = z.object({
  type: z.enum(["missing", "question", "conflict", "assumption", "follow_up"]),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  owner: z.enum(["founder", "advisor"]),
});

/** One-line description of how an item was closed, for history lists. */
export function describeResolution(r: unknown): string | null {
  const res = r as { kind?: string; text?: string; note?: string; label?: string; filename?: string } | null;
  if (!res?.kind) return null;
  switch (res.kind) {
    case "choose":
      return `Kept ${res.label ?? "one value"}`;
    case "confirm":
      return "Confirmed as read";
    case "value":
      return `Corrected to ${res.label ?? "a new value"}`;
    case "answer":
      return `Answered: ${res.text}`;
    case "document":
      return `Use uploaded file ${res.filename ?? ""}`.trim();
    case "unknown":
      return res.note ? `Marked unknown: ${res.note}` : "Marked unknown";
    case "note":
      return res.note ?? "Closed by advisor";
    default:
      return null;
  }
}
