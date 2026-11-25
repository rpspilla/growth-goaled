import Link from "next/link";
import { notFound } from "next/navigation";
import { EvalRunner } from "@/components/advisor/EvalRunner";
import { requireRole } from "@/lib/auth/session";
import { evalRunDetail } from "@/lib/data/evals";
import { averages, criteriaFor } from "@/lib/evals";
import { advanceEvalAction } from "../actions";

export const metadata = { title: "Evaluation run" };
export const maxDuration = 300;

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };
const tone = (v: number | null | undefined) => (typeof v !== "number" ? muted : v >= 4 ? { color: "var(--green)" } : v >= 3 ? fg : { color: "var(--red)" });

/** One evaluation run: progress, the mean score per criterion, and each scenario's answer, scores and notes. */
export default async function EvalRunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["advisor", "admin"]);
  const detail = await evalRunDetail((await params).id);
  if (!detail) notFound();
  const { run, cro, results, scenarios } = detail;
  const mode = run.croId ? "individual" : "collective";
  const criteria = criteriaFor(mode);
  const scored = results.filter((r) => r.scores);
  const avg = run.averages ?? averages(scored);
  return (
    <div className="page space-y-8">
      <header>
        <Link href="/advisor/evals" className="link text-sm">← Evaluations</Link>
        <h1 className="font-display text-3xl mt-2" style={fg}>{cro ? `${cro}'s AI CRO` : "Rally Collective"}</h1>
        <p className="text-sm mt-1" style={muted}>
          {run.scenarioIds.length} scenarios · started {run.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · methodology {run.methodologyVersion}
        </p>
        <div className="mt-2">
          <EvalRunner runId={run.id} initial={{ status: run.status, done: results.length, total: run.scenarioIds.length }} advance={advanceEvalAction} />
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold" style={fg}>Scores by criterion{run.status === "running" ? " (so far)" : ""}</h2>
        <div className="surface overflow-x-auto">
          <table aria-label="Scores by criterion" className="w-full text-sm">
            <tbody>
              {Object.entries(criteria).map(([k, label]) => (
                <tr key={k} className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2" style={fg}>{label}</td>
                  <td className="px-3 py-2 font-mono text-right" style={tone(avg[k])}>{typeof avg[k] === "number" ? `${avg[k]} / 5` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold" style={fg}>Scenarios</h2>
        <ol aria-label="Scenario results" className="space-y-3">
          {scenarios.map((s) => {
            const r = results.find((x) => x.scenarioId === s.id);
            const card = r?.answer?.card as { takeaway?: string; recommendation?: string } | null | undefined;
            return (
              <li key={s.id} className="surface p-4 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-xs" style={muted}>{s.key}</span>
                  <span className="font-semibold flex-1 min-w-[14rem]" style={fg}>{s.question}</span>
                  <span className="text-sm" style={r?.error ? { color: "var(--red)" } : muted}>{!r ? "Waiting" : r.error ? `Failed: ${r.error}` : r.scores ? "Scored" : "Answering…"}</span>
                </div>
                <p className="text-sm" style={muted}>{s.situation}</p>
                {r?.answer && (
                  <details>
                    <summary className="text-sm link cursor-pointer">The answer and its scores</summary>
                    <div className="mt-2 space-y-2 text-sm">
                      <p className="whitespace-pre-wrap" style={fg}>{r.answer.reply}</p>
                      {card?.recommendation && <p style={fg}><span className="font-semibold">Recommendation:</span> {card.recommendation}</p>}
                      {r.summary && <p style={muted}><span className="font-semibold">Judge:</span> {r.summary}</p>}
                      <table className="w-full text-sm">
                        <tbody>
                          {Object.entries(criteria).map(([k, label]) => (
                            <tr key={k} className="border-t" style={{ borderColor: "var(--border)" }}>
                              <td className="py-1 pr-3" style={fg}>{label}</td>
                              <td className="py-1 pr-3 font-mono" style={tone(r.scores?.[k])}>{r.scores?.[k] ?? "n/a"}</td>
                              <td className="py-1" style={muted}>{r.notes?.[k]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
