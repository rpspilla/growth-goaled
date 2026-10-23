"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getManagedCompany } from "@/lib/data/companies";
import {
  approveDeliverable,
  createBenchmarkVersion,
  editDeliverable,
  getDeliverable,
  publishDeliverable,
  runBenchmarkPipeline,
  runQaForVersion,
  sendBackDeliverable,
  type DecisionResult,
} from "@/lib/data/deliverables";

const refresh = () => revalidatePath("/", "layout");

/** The deliverable and its company, only if the signed-in advisor manages that company. */
async function managed(deliverableId: string) {
  const user = await requireRole(["advisor", "admin"]);
  const id = z.uuid().safeParse(deliverableId);
  const d = id.success ? await getDeliverable(id.data) : null;
  const company = d ? await getManagedCompany(user, d.companyId) : null;
  return d && company ? { user, d, company } : null;
}

export async function generateBenchmark(companyId: string): Promise<DecisionResult> {
  const user = await requireRole(["advisor", "admin"]);
  const company = await getManagedCompany(user, z.uuid().parse(companyId));
  if (!company) return { ok: false, error: "That company isn't in your portfolio." };
  const version = await createBenchmarkVersion(company);
  if (!version) return { ok: false, error: "A benchmark is already being prepared for this company." };
  after(() => runBenchmarkPipeline(version.id));
  refresh();
  return { ok: true, newId: version.id };
}

const comment = z.string().trim().max(2000);

export async function approve(deliverableId: string, note: string): Promise<DecisionResult> {
  const ctx = await managed(deliverableId);
  if (!ctx) return { ok: false, error: "Not found." };
  const r = await approveDeliverable(ctx.user, ctx.company, ctx.d.id, comment.parse(note) || null);
  refresh();
  return r;
}

export async function publish(deliverableId: string): Promise<DecisionResult> {
  const ctx = await managed(deliverableId);
  if (!ctx) return { ok: false, error: "Not found." };
  const r = await publishDeliverable(ctx.user, ctx.company, ctx.d.id);
  refresh();
  return r;
}

export async function sendBack(deliverableId: string, note: string): Promise<DecisionResult> {
  const ctx = await managed(deliverableId);
  if (!ctx) return { ok: false, error: "Not found." };
  const text = comment.parse(note);
  const r = await sendBackDeliverable(ctx.user, ctx.company, ctx.d.id, text);
  if (r.ok && r.newId) {
    const newId = r.newId;
    after(() => runBenchmarkPipeline(newId, text));
  }
  refresh();
  return r;
}

const editsSchema = z.object({
  headline: z.string().max(300),
  insightHeadline: z.string().max(300),
  insightBody: z.string().max(2000),
  strengths: z.array(z.string().max(500)).max(10),
  watchAreas: z.array(z.string().max(500)).max(10),
  priority: z.string().max(500),
  comment: z.string().max(2000),
});

export async function saveEdits(deliverableId: string, input: z.infer<typeof editsSchema>): Promise<DecisionResult> {
  const ctx = await managed(deliverableId);
  if (!ctx) return { ok: false, error: "Not found." };
  const parsed = editsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the fields." };
  const { comment: note, ...edits } = parsed.data;
  const r = await editDeliverable(ctx.user, ctx.company, ctx.d.id, edits, note.trim() || null);
  if (r.ok && r.newId) {
    const newId = r.newId;
    after(() => runQaForVersion(newId));
  }
  refresh();
  return r;
}
