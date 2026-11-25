import Link from "next/link";
import { ActionForm } from "@/components/advisor/ActionForm";
import { requireRole } from "@/lib/auth/session";
import { listCroProfiles } from "@/lib/data/cro";
import { evalRuns, evalScenarioList } from "@/lib/data/evals";
import { startEvalAction } from "./actions";

export const metadata = { title: "Evaluations" };

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };
const mean = (a: Record<string, number> | null) => {
  const v = Object.values(a ?? {});
  return v.length ? (v.reduce((x, y) => x + y, 0) / v.length).toFixed(1) : "—";
};

/**
 * Evaluations (Nov 24, 2026): replay founder scenarios against the Collective or a CRO's AI and score
 * each answer on the brief's rubric. Run before changing prompts, models or a CRO's intelligence.
 */
export default async function EvalsPage() {
  await requireRole(["advisor", "admin"]);
  const [scenarios, cros, runs] = await Promise.all([evalScenarioList(), listCroProfiles({ published: true }), evalRuns()]);
  return (
    <div className="page space-y-8">
      <header>
        <h1 className="font-display text-3xl" style={fg}>Evaluations</h1>
        <p className="text-sm mt-1 max-w-3xl" style={muted}>
          {scenarios.length} founder scenarios: the brief&apos;s and every one in the imported training workbooks. Each run answers them as the Collective or a CRO&apos;s AI, then a judge scores every answer 1–5 on context, diagnosis, judgment, prioritization, actionability, accuracy, continuity, challenge and founder experience, plus fidelity to the CRO (their expertise, philosophy, frameworks, style, nothing invented) or, for the Collective, synthesis, disagreement and attribution. A CRO&apos;s own workbook answer is the reference for their AI and is left out of what it sees.
        </p>
      </header>

      <section className="surface p-5 space-y-3">
        <h2 className="text-lg font-semibold" style={fg}>New run</h2>
        <ActionForm action={startEvalAction} submit="Start the run" label="New evaluation run" className="flex gap-3 items-end flex-wrap">
          <label className="block">
            <span className="label">Who answers</span>
            <select name="croId" defaultValue="" className="field mt-1" aria-label="Who answers">
              <option value="">The Rally Collective</option>
              {cros.map((c) => (
                <option key={c.id} value={c.id}>{c.name}&apos;s AI CRO</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Scenarios</span>
            <select name="count" defaultValue="5" className="field mt-1" aria-label="Scenarios">
              {[3, 5, 10, 20].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </ActionForm>
        <p className="text-xs" style={muted}>Each scenario is two AI calls (the answer, then the judge): about a minute each. A CRO&apos;s run starts with the scenarios they answered in their workbook.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold" style={fg}>Runs</h2>
        {runs.length ? (
          <ul aria-label="Evaluation runs" className="surface divide-y text-sm" style={{ borderColor: "var(--border)" }}>
            {runs.map(({ run, cro }) => (
              <li key={run.id} className="p-3 flex items-center gap-4 flex-wrap" style={{ borderColor: "var(--border)" }}>
                <Link href={`/advisor/evals/${run.id}`} className="link font-semibold flex-1 min-w-[14rem]">{cro ? `${cro}'s AI CRO` : "Rally Collective"}</Link>
                <span style={muted}>{run.scenarioIds.length} scenarios · {run.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {run.methodologyVersion}</span>
                <span className="font-mono" style={fg}>{run.status === "done" ? `${mean(run.averages)} / 5` : run.status === "running" ? "Running" : "Failed"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="surface p-4 text-sm" style={muted}>No runs yet.</p>
        )}
      </section>
    </div>
  );
}
