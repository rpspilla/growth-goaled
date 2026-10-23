"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { cohortInputSchema, sourceInputSchema } from "@/lib/benchmarks";
import {
  createCohort,
  discardProposedMetric,
  importBenchmarkCsv,
  runResearch,
  setMetricStatus,
  startResearch,
  updateCohort,
  type ImportResult,
} from "@/lib/data/benchmarks";

const refresh = () => revalidatePath("/advisor/benchmarks");
const staff = () => requireRole(["advisor", "admin"]);

export type FormState = { ok: boolean; error?: string; id?: string } | null;

function cohortFromForm(fd: FormData) {
  const opt = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v ? v : undefined;
  };
  const usd = (k: string) => {
    const v = opt(k)?.replace(/[$,\s]/g, "");
    if (!v) return undefined;
    const m = v.match(/^(\d+(?:\.\d+)?)([kKmM]?)$/);
    if (!m) return v; // let validation reject it
    return String(Number(m[1]) * (m[2]?.toLowerCase() === "m" ? 1_000_000 : m[2]?.toLowerCase() === "k" ? 1_000 : 1));
  };
  return cohortInputSchema.safeParse({
    name: fd.get("name"),
    description: opt("description"),
    stage: String(fd.get("stage") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    arr_min: usd("arr_min"),
    arr_max: usd("arr_max"),
    model: opt("model"),
    gtm_motion: opt("gtm_motion"),
    companyCount: opt("companyCount"),
  });
}

export async function saveCohort(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await staff();
  const parsed = cohortFromForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  const id = z.uuid().safeParse(fd.get("id"));
  if (id.success) {
    if (!(await updateCohort(user, id.data, parsed.data))) return { ok: false, error: "That cohort can't be edited." };
    refresh();
    return { ok: true, id: id.data };
  }
  const created = await createCohort(user, parsed.data);
  refresh();
  return created ? { ok: true, id: created.id } : { ok: false, error: "Not allowed." };
}

export async function changeMetricStatus(metricId: string, status: "approved" | "retired" | "proposed") {
  const user = await staff();
  const result = await setMetricStatus(user, z.uuid().parse(metricId), z.enum(["approved", "retired", "proposed"]).parse(status));
  refresh();
  return result;
}

export async function discardMetric(metricId: string): Promise<void> {
  const user = await staff();
  await discardProposedMetric(user, z.uuid().parse(metricId));
  refresh();
}

const MAX_CSV = 1_000_000;

export async function importCsv(_prev: ImportResult | null, fd: FormData): Promise<ImportResult> {
  const user = await staff();
  const cohortId = z.uuid().safeParse(fd.get("cohortId"));
  if (!cohortId.success) return { ok: false, error: "Choose a cohort." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file." };
  if (file.size > MAX_CSV) return { ok: false, error: "CSV files can be up to 1 MB." };
  const source = sourceInputSchema.safeParse({
    name: fd.get("sourceName"),
    publisher: String(fd.get("publisher") ?? "").trim() || undefined,
    year: String(fd.get("year") ?? "").trim() || undefined,
    licenceNote: String(fd.get("licenceNote") ?? "").trim() || undefined,
    notes: String(fd.get("notes") ?? "").trim() || undefined,
  });
  if (!source.success) return { ok: false, error: `Source: ${source.error.issues[0]?.message ?? "check the fields."}` };
  const result = await importBenchmarkCsv(user, cohortId.data, await file.text(), source.data);
  refresh();
  return result;
}

/** Starts a public research run; the work happens after the response, within maxDuration. */
export async function researchCohort(cohortId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await staff();
  const started = await startResearch(user, z.uuid().parse(cohortId));
  if ("error" in started) return { ok: false, error: started.error };
  after(() => runResearch(started.runId));
  refresh();
  return { ok: true };
}
