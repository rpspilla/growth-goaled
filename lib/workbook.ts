/**
 * The CRO Training Workbook (Nov 24, 2026): one row per founder scenario, with one CRO's structured
 * answer in the "Your …" columns, and short answers from named CROs in "<Name> Answer" columns.
 * Pure parsing; lib/data/workbook-import.ts turns it into attributed Scenario records.
 */

export type WorkbookScenario = {
  key: string;
  category: string;
  stage: string;
  situation: string;
  question: string;
  /** The respondent's structured answer: section label → text (only filled sections). */
  answer: { label: string; text: string }[];
  /** "<Name> Answer" columns: name as written → text. */
  named: { name: string; text: string }[];
  differences: string;
  status: string;
  notes: string;
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The respondent's columns, in the workbook's order, with the label used in the record. */
export const ANSWER_COLUMNS: { header: string; label: string }[] = [
  { header: "your initial instinct what jumps out", label: "Initial instinct" },
  { header: "your diagnosis hypothesis", label: "Diagnosis" },
  { header: "questions you would ask in order", label: "Questions I'd ask, in order" },
  { header: "your recommendation position", label: "Recommendation" },
  { header: "why your reasoning", label: "Why" },
  { header: "what you would not recommend", label: "What I would not recommend" },
  { header: "tradeoffs risks", label: "Tradeoffs and risks" },
  { header: "what would change your mind", label: "What would change my mind" },
  { header: "next 1 3 actions", label: "Next 1–3 actions" },
  { header: "success metrics evidence", label: "Success metrics" },
  { header: "example of how you would say it", label: "How I'd say it" },
];

/** Which expertise a workbook category draws on (for retrieval). */
export const CATEGORY_EXPERTISE: Record<string, string[]> = {
  "growth strategy": ["growth strategy", "gtm strategy"],
  "icp positioning": ["icp", "positioning"],
  "product market fit": ["product-market fit", "retention"],
  "sales pipeline": ["sales", "pipeline", "revenue operations"],
  "marketing channels": ["marketing", "gtm strategy", "pipeline"],
  "hiring organization": ["sales hiring", "organizational design", "compensation"],
  "pricing revenue": ["pricing"],
  "retention customer success": ["retention", "customer success"],
  "capital fundraising": ["fundraising", "growth strategy"],
  "founder decision making": ["growth strategy", "founder-led sales"],
  "execution accountability": ["growth strategy", "revenue operations"],
  "general cro judgment": ["growth strategy"],
};

export class WorkbookError extends Error {}

/** Rows (header first) → scenarios. Throws WorkbookError when the required columns aren't there. */
export function parseWorkbook(rows: string[][]): WorkbookScenario[] {
  const headerIndex = rows.findIndex((r) => r.some((c) => norm(c) === "scenario id"));
  if (headerIndex < 0) throw new WorkbookError("This doesn't look like the CRO Training Workbook: there's no Scenario ID column.");
  const header = rows[headerIndex]!.map(norm);
  const col = (name: string) => header.indexOf(name);
  const need = { key: col("scenario id"), category: col("category"), stage: col("stage"), situation: col("founder situation"), question: col("founder question") };
  const missing = Object.entries(need).filter(([, i]) => i < 0).map(([k]) => k);
  if (missing.length) throw new WorkbookError(`The workbook is missing columns: ${missing.join(", ")}.`);
  const answerCols = ANSWER_COLUMNS.map((a) => ({ ...a, i: col(a.header) })).filter((a) => a.i >= 0);
  const namedCols = rows[headerIndex]!.flatMap((h, i) => {
    const m = /^\s*(.+?)\s+answer\s*$/i.exec(h);
    return m && !/^your\b/i.test(m[1]!) ? [{ name: m[1]!.trim(), i }] : [];
  });
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  return rows
    .slice(headerIndex + 1)
    .filter((r) => at(r, need.key))
    .map((r) => ({
      key: at(r, need.key),
      category: at(r, need.category),
      stage: at(r, need.stage),
      situation: at(r, need.situation),
      question: at(r, need.question),
      answer: answerCols.map((a) => ({ label: a.label, text: at(r, a.i) })).filter((a) => a.text),
      named: namedCols.map((n) => ({ name: n.name, text: at(r, n.i) })).filter((n) => n.text),
      differences: at(r, col("differences discussion")),
      status: at(r, col("status")),
      notes: at(r, col("notes real example")),
    }));
}

/** A record's content from one CRO's answer to a scenario. */
export function scenarioContent(s: WorkbookScenario, answer: { label: string; text: string }[] | string): string {
  const body = typeof answer === "string" ? `Answer: ${answer}` : answer.map((a) => `${a.label}: ${a.text}`).join("\n");
  return [`Founder situation (${s.stage || "any stage"}): ${s.situation}`, `Founder question: ${s.question}`, "", body, s.notes ? `\nReal example: ${s.notes}` : "", s.differences ? `\nWhere our CROs differ: ${s.differences}` : ""]
    .filter((x, i) => x !== "" || i === 2)
    .join("\n")
    .trim();
}
