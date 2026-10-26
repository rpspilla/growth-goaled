"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { createBenchmarkVersion, runBenchmarkPipeline } from "@/lib/data/deliverables";
import { startPreliminaryIfDue } from "@/lib/data/preliminary";
import { track } from "@/lib/events";

async function founderCompany() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) throw new Error("Your company isn't set up yet.");
  return { user, company };
}

/** Analytics only: a founder opened the Source Trail for a claim. */
export async function sourceTrailOpened(claimKey: string): Promise<void> {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (company) await track("source_trail_opened", { userId: user.id, companyId: company.id, props: { claimKey: claimKey.slice(0, 80), type: "benchmark" } });
}

/** Builds a preliminary Benchmark once uploads have settled and the figures changed (no-op otherwise). */
export async function ensurePreliminary(): Promise<{ started: boolean }> {
  const { company } = await founderCompany();
  const id = await startPreliminaryIfDue(company);
  if (id) {
    after(() => runBenchmarkPipeline(id));
    revalidatePath("/", "layout");
  }
  return { started: Boolean(id) };
}

/** "Build it again" from the Benchmark page (e.g. after adding data). */
export async function rebuildPreliminary(): Promise<{ ok: boolean; error?: string }> {
  const { company } = await founderCompany();
  const version = await createBenchmarkVersion(company, { preliminary: true });
  if (!version) return { ok: false, error: "Your benchmark is already being prepared or reviewed." };
  after(() => runBenchmarkPipeline(version.id));
  revalidatePath("/", "layout");
  return { ok: true };
}
