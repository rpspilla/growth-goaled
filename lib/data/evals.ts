import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { EvalResult, EvalRun, EvalScenario, User } from "@/lib/db/schema";
import { chatTurn } from "@/lib/ai/chat";
import { judgeAnswer } from "@/lib/ai/judge";
import type { ChatContext } from "@/lib/chat/context";
import { CHAT_METHODOLOGY_VERSION, getChatTopic } from "@/lib/chat/topics";
import { averages, BUILT_IN_SCENARIOS } from "@/lib/evals";
import type { WorkbookScenario } from "@/lib/workbook";
import { getCroProfile, intelligenceFor } from "./cro";

/**
 * Evaluations (Nov 24, 2026): replay founder scenarios against the Collective or one CRO's AI and
 * score each answer on the multi-CRO rubric. A run advances one scenario per call (each call fits in
 * a server request), so the run page drives it while it's open.
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const MAX_SCENARIOS = 20;

/** The workbook's scenarios join the test set (by scenario id); the brief's built-in ones are always there. */
export async function upsertEvalScenarios(rows: Pick<WorkbookScenario, "key" | "category" | "stage" | "situation" | "question">[], source: string): Promise<void> {
  for (const s of rows) {
    if (!s.key || !s.situation || !s.question) continue;
    await db
      .insert(schema.evalScenarios)
      .values({ key: s.key, category: s.category || null, stage: s.stage || null, situation: s.situation, question: s.question, source })
      .onConflictDoUpdate({ target: schema.evalScenarios.key, set: { category: s.category || null, stage: s.stage || null, situation: s.situation, question: s.question, source, updatedAt: new Date() } });
  }
}

export async function evalScenarioList(): Promise<EvalScenario[]> {
  await upsertEvalScenarios([...BUILT_IN_SCENARIOS], "The multi-CRO brief");
  return db.select().from(schema.evalScenarios).where(eq(schema.evalScenarios.active, true)).orderBy(asc(schema.evalScenarios.key));
}

/**
 * Start a run: the Collective (croId null) or a published CRO's AI, on up to 20 scenarios. For a CRO,
 * scenarios they answered in their workbook come first (their answer is the reference).
 */
export async function startEvalRun(actor: Pick<User, "id">, input: { croId: string | null; count: number; scenarioKeys?: string[] }): Promise<Result<{ id: string }>> {
  const cro = input.croId ? await getCroProfile(input.croId) : null;
  if (input.croId && cro?.status !== "published") return { ok: false, error: "Evaluate a published CRO." };
  const count = Math.min(Math.max(Math.floor(input.count) || 0, 1), MAX_SCENARIOS);
  let scenarios = await evalScenarioList();
  if (input.scenarioKeys?.length) scenarios = scenarios.filter((s) => input.scenarioKeys!.includes(s.key));
  if (cro) {
    const answered = new Set(
      (await db.select({ key: schema.croIntelligence.sourceKey }).from(schema.croIntelligence).where(eq(schema.croIntelligence.primaryCroId, cro.id))).flatMap((r) => (r.key ? [r.key] : [])),
    );
    scenarios = [...scenarios.filter((s) => answered.has(s.key)), ...scenarios.filter((s) => !answered.has(s.key))];
  }
  const chosen = scenarios.slice(0, count);
  if (!chosen.length) return { ok: false, error: "There are no scenarios yet. Import a training workbook first." };
  const [run] = await db.insert(schema.evalRuns).values({ croId: cro?.id ?? null, scenarioIds: chosen.map((s) => s.id), methodologyVersion: CHAT_METHODOLOGY_VERSION, createdBy: actor.id }).returning({ id: schema.evalRuns.id });
  return { ok: true, id: run!.id };
}

/** Answer and score the run's next scenario; finishes the run (with its averages) after the last. */
export async function advanceEvalRun(runId: string): Promise<{ status: EvalRun["status"]; done: number; total: number }> {
  const [run] = await db.select().from(schema.evalRuns).where(eq(schema.evalRuns.id, runId)).limit(1);
  if (!run) return { status: "failed", done: 0, total: 0 };
  const results = await db.select().from(schema.evalResults).where(eq(schema.evalResults.runId, run.id));
  const total = run.scenarioIds.length;
  if (run.status !== "running") return { status: run.status, done: results.length, total };
  const doneIds = new Set(results.map((r) => r.scenarioId));
  const nextId = run.scenarioIds.find((id) => !doneIds.has(id));
  if (!nextId) {
    await db.update(schema.evalRuns).set({ status: "done", averages: averages(results), finishedAt: new Date(), updatedAt: new Date() }).where(eq(schema.evalRuns.id, run.id));
    return { status: "done", done: results.length, total };
  }
  const [scenario] = await db.select().from(schema.evalScenarios).where(eq(schema.evalScenarios.id, nextId)).limit(1);
  // Claim the scenario first, so two open pages never answer it twice.
  const [claimed] = await db.insert(schema.evalResults).values({ runId: run.id, scenarioId: nextId }).onConflictDoNothing().returning({ id: schema.evalResults.id });
  if (!claimed || !scenario) return { status: "running", done: results.length, total };
  try {
    const scored = await answerAndScore(run, scenario);
    await db.update(schema.evalResults).set({ ...scored, updatedAt: new Date() }).where(eq(schema.evalResults.id, claimed.id));
  } catch (err) {
    console.error("[evals] Scenario failed", err);
    await db.update(schema.evalResults).set({ error: err instanceof Error ? err.message.slice(0, 300) : "Failed", updatedAt: new Date() }).where(eq(schema.evalResults.id, claimed.id));
  }
  return { status: "running", done: results.length + 1, total };
}

async function answerAndScore(run: EvalRun, scenario: EvalScenario): Promise<Pick<EvalResult, "answer" | "scores" | "notes" | "summary">> {
  const cro = run.croId ? await getCroProfile(run.croId) : null;
  // A company described only by the scenario: what a founder would say in a first message.
  const context: ChatContext = {
    company: { name: "The founder's company", stage: scenario.stage },
    answers: [],
    figures: [],
    facts: [{ key: "situation", label: "Situation", value: scenario.situation, status: "stated" }],
    work: { projects: [], commitments: [], priorities: null, results: [], attention: [] },
    earlierConversations: [],
    compensationData: [],
  };
  const question = `${scenario.situation}\n\n${scenario.question}`;
  const intelligence = await intelligenceFor({ stage: scenario.stage, industry: null }, cro?.id ?? null, { text: question, topicId: "other" }, { excludeSourceKey: scenario.key });
  const { output } = await chatTurn({ topic: getChatTopic("other")!, context, history: [{ role: "user", content: question }], intelligence, answerNow: true });
  const given = new Set(intelligence?.records.map((r) => r.id) ?? []);
  const answer = { reply: output.reply, card: output.recommendation, used: output.intelligence_used.map((u) => u.id).filter((id) => given.has(id)) };
  const [reference] = cro
    ? await db.select({ content: schema.croIntelligence.content }).from(schema.croIntelligence).where(and(eq(schema.croIntelligence.primaryCroId, cro.id), eq(schema.croIntelligence.sourceKey, scenario.key))).limit(1)
    : [];
  const judged = await judgeAnswer({
    mode: cro ? "individual" : "collective",
    scenario: { situation: scenario.situation, question: scenario.question, stage: scenario.stage },
    answer,
    cro: cro ? { name: cro.name, profile: { headline: cro.headline, bio: cro.bio, expertise: cro.expertise, philosophy: cro.philosophy, style: cro.style } } : null,
    reference: reference?.content ?? null,
    records: (intelligence?.records ?? []).map((r) => ({ id: r.id, cro: r.primaryCroName ?? "Network position", title: r.title, content: r.content })),
  });
  return { answer, scores: judged.scores, notes: judged.notes, summary: judged.summary };
}

export async function evalRuns(limit = 30) {
  return db
    .select({ run: schema.evalRuns, cro: schema.croProfiles.name })
    .from(schema.evalRuns)
    .leftJoin(schema.croProfiles, eq(schema.croProfiles.id, schema.evalRuns.croId))
    .orderBy(desc(schema.evalRuns.createdAt))
    .limit(limit);
}

export async function evalRunDetail(runId: string) {
  if (!/^[0-9a-f-]{36}$/.test(runId)) return null;
  const [row] = await db.select({ run: schema.evalRuns, cro: schema.croProfiles.name }).from(schema.evalRuns).leftJoin(schema.croProfiles, eq(schema.croProfiles.id, schema.evalRuns.croId)).where(eq(schema.evalRuns.id, runId)).limit(1);
  if (!row) return null;
  const [results, scenarios] = await Promise.all([
    db.select().from(schema.evalResults).where(eq(schema.evalResults.runId, runId)),
    row.run.scenarioIds.length ? db.select().from(schema.evalScenarios).where(inArray(schema.evalScenarios.id, row.run.scenarioIds)) : Promise.resolve([]),
  ]);
  return { ...row, results, scenarios: row.run.scenarioIds.map((id) => scenarios.find((s) => s.id === id)!).filter(Boolean) };
}
