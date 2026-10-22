"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { processDocument, registerDocument, resetFailedDocument, reviewDataPoint } from "@/lib/data/documents";
import { schema } from "@/lib/db";

async function founderCompany() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) throw new Error("Your company isn't set up yet.");
  return { user, company };
}

const registerInput = z.object({
  pathname: z.string().min(1).max(1024),
  filename: z.string().min(1).max(255),
  docType: z.enum(schema.docType.enumValues),
});

/** Called after the browser finishes uploading to Blob; extraction runs after the response. */
export async function registerUpload(input: z.infer<typeof registerInput>): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, company } = await founderCompany();
  const parsed = registerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload." };
  try {
    const doc = await registerDocument(user, company, parsed.data);
    after(() => processDocument(doc.id));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }
  revalidatePath("/upload");
  return { ok: true };
}

export async function retryDocument(documentId: string): Promise<void> {
  const { company } = await founderCompany();
  if (await resetFailedDocument(company, z.uuid().parse(documentId))) after(() => processDocument(documentId));
  revalidatePath("/upload");
}

export async function reviewPoint(dataPointId: string, decision: "accepted" | "rejected"): Promise<void> {
  const { user, company } = await founderCompany();
  await reviewDataPoint(user, company, z.uuid().parse(dataPointId), z.enum(["accepted", "rejected"]).parse(decision));
  revalidatePath("/upload");
}
