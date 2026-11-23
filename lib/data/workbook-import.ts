import "server-only";
import ExcelJS from "exceljs";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { parseCsv } from "@/lib/file-profile";
import { CATEGORY_EXPERTISE, parseWorkbook, scenarioContent, WorkbookError, type WorkbookScenario } from "@/lib/workbook";
import { croForUser, listCroProfiles, setIntelligenceStatus } from "./cro";

/**
 * Importing a CRO Training Workbook (Nov 24, 2026): each scenario a CRO answered becomes a Scenario
 * record attributed to that CRO, submitted for review. The respondent's "Your …" columns go to the
 * CRO chosen at import; "<Name> Answer" columns go to the CRO with that first name. Scenarios answered
 * by several CROs are linked as related records, with the workbook's discussion of their differences.
 * Re-importing updates the same records (by scenario id) and never duplicates them.
 */

export type ImportSummary = {
  scenarios: number;
  created: number;
  updated: number;
  unchanged: number;
  /** Rows nobody answered yet. */
  unanswered: number;
  /** "<Name> Answer" columns with no matching CRO, or not yours to import. */
  skippedNames: string[];
  recordIds: string[];
};
export type ImportResult = ({ ok: true } & ImportSummary) | { ok: false; error: string };

const MAX_BYTES = 1024 * 1024;

/** Rows from an uploaded CSV or Excel workbook (the sheet with "Scenario ID", else the first). */
export async function workbookRows(filename: string, bytes: Buffer): Promise<string[][]> {
  if (bytes.length > MAX_BYTES) throw new WorkbookError("The workbook can be up to 1 MB (save it as .csv if it is larger).");
  if (/\.csv$/i.test(filename)) return parseCsv(bytes.toString("utf8").replace(/^﻿/, ""));
  if (!/\.xlsx$/i.test(filename)) throw new WorkbookError("Upload the workbook as .csv or .xlsx.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheets: string[][][] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text ?? "");
      rows.push(cells);
    });
    sheets.push(rows);
  });
  return sheets.find((rows) => rows.some((r) => r.some((c) => /^\s*scenario id\s*$/i.test(c)))) ?? sheets[0] ?? [];
}

const firstName = (name: string) => name.trim().split(/\s+/)[0]!.toLowerCase();

/** Import a parsed workbook. Admins import for any CRO; a CRO only their own answers. */
export async function importWorkbook(actor: Pick<User, "id" | "role">, input: { filename: string; rows: string[][]; respondentCroId: string | null }): Promise<ImportResult> {
  let scenarios: WorkbookScenario[];
  try {
    scenarios = parseWorkbook(input.rows);
  } catch (err) {
    if (err instanceof WorkbookError) return { ok: false, error: err.message };
    throw err;
  }
  if (!scenarios.length) return { ok: false, error: "The workbook has no scenarios." };
  const [profiles, mine] = await Promise.all([listCroProfiles(), croForUser(actor.id)]);
  if (actor.role !== "admin" && !mine) return { ok: false, error: "Your login isn't linked to a CRO profile yet. Ask an admin." };
  const respondent = input.respondentCroId ? profiles.find((p) => p.id === input.respondentCroId) : null;
  if (input.respondentCroId && !respondent) return { ok: false, error: "That CRO wasn't found." };
  if (actor.role !== "admin" && respondent && respondent.id !== mine!.id) return { ok: false, error: "You can only import your own answers." };
  const byFirstName = new Map(profiles.map((p) => [firstName(p.name), p]));
  const allowed = (croId: string) => actor.role === "admin" || croId === mine?.id;

  const summary: ImportSummary = { scenarios: scenarios.length, created: 0, updated: 0, unchanged: 0, unanswered: 0, skippedNames: [], recordIds: [] };
  const skipped = new Set<string>();
  for (const s of scenarios) {
    const answers: { croId: string; content: string }[] = [];
    if (respondent && s.answer.length) answers.push({ croId: respondent.id, content: scenarioContent(s, s.answer) });
    for (const n of s.named) {
      const cro = byFirstName.get(firstName(n.name));
      if (!cro || !allowed(cro.id)) {
        skipped.add(n.name);
        continue;
      }
      // The respondent's structured answer, when they also wrote a short one, is the fuller of the two.
      if (answers.some((a) => a.croId === cro.id)) continue;
      answers.push({ croId: cro.id, content: scenarioContent(s, n.text) });
    }
    if (!answers.length) {
      summary.unanswered++;
      continue;
    }
    const ids: string[] = [];
    for (const a of answers) {
      const outcome = await upsertScenario(actor, input.filename, s, a.croId, a.content);
      summary[outcome.change]++;
      ids.push(outcome.id);
    }
    // Answered by several CROs: each record points at the others.
    if (ids.length > 1) {
      for (const id of ids) {
        const [r] = await db.select({ relatedIds: schema.croIntelligence.relatedIds }).from(schema.croIntelligence).where(eq(schema.croIntelligence.id, id)).limit(1);
        const related = [...new Set([...(r?.relatedIds ?? []), ...ids.filter((x) => x !== id)])];
        await db.update(schema.croIntelligence).set({ relatedIds: related }).where(eq(schema.croIntelligence.id, id));
      }
    }
    summary.recordIds.push(...ids);
  }
  summary.skippedNames = [...skipped];
  await track("cro_workbook_imported", { userId: actor.id, props: { scenarios: summary.scenarios, created: summary.created, updated: summary.updated } });
  return { ok: true, ...summary };
}

async function upsertScenario(actor: Pick<User, "id">, filename: string, s: WorkbookScenario, croId: string, content: string): Promise<{ id: string; change: "created" | "updated" | "unchanged" }> {
  const category = s.category.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const values = {
    type: "scenario" as const,
    category: s.category || null,
    title: `${s.key}: ${s.question}`.slice(0, 200),
    content: content.slice(0, 8000),
    tags: [...new Set([s.key.toLowerCase(), category].filter(Boolean))],
    stages: s.stage ? [s.stage] : [],
    expertise: CATEGORY_EXPERTISE[category] ?? [],
    classification: "individual" as const,
    source: `CRO Training Workbook (${filename.slice(0, 120)})`,
    evidence: s.notes ? ("case_evidence" as const) : ("experience" as const),
  };
  const [existing] = await db
    .select()
    .from(schema.croIntelligence)
    .where(and(eq(schema.croIntelligence.primaryCroId, croId), eq(schema.croIntelligence.sourceKey, s.key)))
    .limit(1);
  if (existing) {
    if (existing.content === values.content && existing.title === values.title) return { id: existing.id, change: "unchanged" };
    const wasValidated = existing.status === "validated";
    await db
      .update(schema.croIntelligence)
      .set({ ...values, status: "submitted", ...(wasValidated ? { version: existing.version + 1, validatedBy: null, validatedAt: null } : {}), updatedAt: new Date() })
      .where(eq(schema.croIntelligence.id, existing.id));
    return { id: existing.id, change: "updated" };
  }
  const [r] = await db
    .insert(schema.croIntelligence)
    .values({ ...values, primaryCroId: croId, sourceKey: s.key, status: "submitted", modes: ["individual", "collective"], createdBy: actor.id })
    .returning({ id: schema.croIntelligence.id });
  await db.insert(schema.croIntelligenceContributors).values({ recordId: r!.id, croId, stance: "author" });
  return { id: r!.id, change: "created" };
}

/** Validate the submitted records of an import at once (the same rule as one at a time: never the author, unless an admin). */
export async function validateImported(actor: Pick<User, "id" | "role">, recordIds: string[]): Promise<{ validated: number; refused: number }> {
  const ids = [...new Set(recordIds)].filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 500);
  if (!ids.length) return { validated: 0, refused: 0 };
  const rows = await db.select({ id: schema.croIntelligence.id }).from(schema.croIntelligence).where(and(inArray(schema.croIntelligence.id, ids), eq(schema.croIntelligence.status, "submitted")));
  let validated = 0;
  let refused = 0;
  for (const r of rows) {
    const result = await setIntelligenceStatus(actor, r.id, "validated");
    if (result.ok) validated++;
    else refused++;
  }
  return { validated, refused };
}
