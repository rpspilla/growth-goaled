/**
 * Action plan items as founder inputs (Nov 12, 2026 call): each founder item asks for specific
 * data, names the exact fields, and can be answered by typing the values (self-report) or by
 * dropping a file with the named columns. What Growth Goaled does with it is an advisor task,
 * kept apart and shown to advisors only.
 */

export const FIELD_KINDS = ["currency", "percent", "days", "number", "text", "date"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** One value the founder is asked for. `metric`: the stored figure it becomes (lib/metrics key), when it is one. */
export type RequestField = { key: string; label: string; kind: FieldKind; hint?: string; metric?: string };

/** How the founder answered: typed values, or a file (read by the usual document pipeline). */
export type RequestAnswer = { values: Record<string, string>; documentId?: string; filename?: string; at: string; by: string };

/** What a founder item asks for: the fields to type, or the columns a dropped file must have. */
export type DataRequest = { fields: RequestField[]; columns: string[]; answer?: RequestAnswer };

/** Something Growth Goaled does in the plan: advisors only (never shown to the founder). */
export type AdvisorTask = { action: string; why?: string; status?: "todo" | "doing" | "done" };

export const KIND_UNIT: Record<FieldKind, string> = { currency: "$", percent: "%", days: "days", number: "", text: "", date: "" };

/** A machine key from a label: "Average deal cycle (AE-closed)" → "average_deal_cycle_ae_closed". */
export const fieldKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "value";

/** Pure: the request with sane, unique keys and at most 8 fields and 12 columns. */
export function normalizeRequest(r: { fields: { label: string; kind?: string; hint?: string | null; metric?: string | null; key?: string }[]; columns: string[] }): DataRequest {
  const seen = new Set<string>();
  const fields: RequestField[] = [];
  for (const f of r.fields) {
    const label = f.label.trim().slice(0, 120);
    if (!label) continue;
    let key = fieldKey(f.key || label);
    while (seen.has(key)) key = `${key}_2`;
    seen.add(key);
    const kind = (FIELD_KINDS as readonly string[]).includes(f.kind ?? "") ? (f.kind as FieldKind) : "text";
    fields.push({ key, label, kind, ...(f.hint?.trim() ? { hint: f.hint.trim().slice(0, 200) } : {}), ...(f.metric?.trim() ? { metric: f.metric.trim() } : {}) });
    if (fields.length === 8) break;
  }
  const columns = [...new Set(r.columns.map((c) => c.trim().slice(0, 80)).filter(Boolean))].slice(0, 12);
  return { fields, columns };
}

/** Pure: checks typed values against the request. Every field is required; numbers must be numbers. */
export function checkAnswer(request: Pick<DataRequest, "fields">, raw: Record<string, unknown>): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  const values: Record<string, string> = {};
  for (const f of request.fields) {
    const v = String(raw[f.key] ?? "").trim();
    if (!v) return { ok: false, error: `Enter ${f.label}.` };
    if (v.length > 500) return { ok: false, error: `${f.label} is too long.` };
    if (f.kind === "text") {
      values[f.key] = v;
      continue;
    }
    if (f.kind === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`))) return { ok: false, error: `${f.label}: pick a date.` };
      values[f.key] = v;
      continue;
    }
    const n = Number(v.replace(/[$,%\s]/g, "").replace(/days?$/i, ""));
    if (!Number.isFinite(n)) return { ok: false, error: `${f.label} should be a number.` };
    if (n < 0 && f.kind !== "percent") return { ok: false, error: `${f.label} can't be negative.` };
    if (f.kind === "percent" && (n < -100 || n > 1000)) return { ok: false, error: `${f.label} is a percent.` };
    values[f.key] = String(n);
  }
  return { ok: true, values };
}

/** Pure: "Enter A, B and C" for the request's fields (the founder's next step). */
export function askFor(request: Pick<DataRequest, "fields">): string {
  const labels = request.fields.map((f) => f.label);
  if (!labels.length) return "";
  const list = labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  return `Enter ${list}`;
}

/** Pure: an answer as a short line ("Average deal cycle: 45 days · Win rate: 22%"). */
export function answerLine(request: DataRequest): string {
  if (!request.answer) return "";
  if (request.answer.filename && !Object.keys(request.answer.values).length) return `File: ${request.answer.filename}`;
  return request.fields
    .filter((f) => request.answer!.values[f.key] !== undefined)
    .map((f) => {
      const v = request.answer!.values[f.key]!;
      const shown = f.kind === "currency" ? `$${Number(v).toLocaleString("en-US")}` : f.kind === "percent" ? `${v}%` : f.kind === "days" ? `${v} days` : v;
      return `${f.label}: ${shown}`;
    })
    .join(" · ");
}
