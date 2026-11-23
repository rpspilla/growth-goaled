"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { advanceEvalRun, startEvalRun } from "@/lib/data/evals";

// Evaluations are for Growth Goaled staff (advisors and admins).
const staff = () => requireRole(["advisor", "admin"]);

/** Start an evaluation run and open it (the run page drives it, one scenario at a time). */
export async function startEvalAction(_prev: { ok: false; error: string } | { ok: true } | null, f: FormData): Promise<{ ok: false; error: string } | { ok: true }> {
  const user = await staff();
  const cro = z.uuid().safeParse(f.get("croId"));
  const r = await startEvalRun(user, { croId: cro.success ? cro.data : null, count: Number(f.get("count") ?? 5) });
  if (!r.ok) return r;
  redirect(`/advisor/evals/${r.id}`);
}

/** Answer and score the run's next scenario. */
export async function advanceEvalAction(runId: string) {
  await staff();
  if (!z.uuid().safeParse(runId).success) return { status: "failed" as const, done: 0, total: 0 };
  const r = await advanceEvalRun(runId);
  return r;
}
