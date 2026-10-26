import { formatMetric } from "@/lib/metrics";
import type { FileAnalysis } from "@/lib/metrics-engine";
import { monthLabel } from "@/lib/metrics-engine/tables";
import type { Diagnosis } from "./index";

/**
 * Turns code-side evidence into what the Draft Agent reads and cites: the diagnosis with
 * numbered evidence ("ev:N", "candidate:<id>"), and the tables computed from each file
 * ("analysis:N"). Pure, so the exact wording is tested.
 */

const usd = (v: number) => formatMetric("arr", v);
const customers = (n: number) => `${n} ${n === 1 ? "customer" : "customers"}`;

export type DiagnosisInput = {
  certainty: Diagnosis["certainty"];
  candidates: { id: string; title: string; arr_at_stake: string | null; context: string[]; supporting: string[]; contradicting: string[]; test: string }[];
  evidence: { id: string; text: string; kind: "calculated" | "reported" | "inference" }[];
  unknowns: string[];
};

/** Numbers each piece of evidence once; candidates refer to evidence by id. */
export function diagnosisInput(d: Diagnosis): DiagnosisInput {
  const evidence: DiagnosisInput["evidence"] = [];
  const idOf = new Map<string, string>();
  const ref = (e: { text: string; kind: DiagnosisInput["evidence"][number]["kind"] }) => {
    let id = idOf.get(e.text);
    if (!id) {
      id = `ev:${evidence.length}`;
      idOf.set(e.text, id);
      evidence.push({ id, text: e.text, kind: e.kind });
    }
    return id;
  };
  return {
    certainty: d.certainty,
    candidates: d.candidates.map((c) => ({
      id: c.id,
      title: c.title,
      arr_at_stake: c.impactArr ? usd(c.impactArr) : null,
      context: c.context.map(ref),
      supporting: c.supporting.map(ref),
      contradicting: c.contradicting.map(ref),
      test: c.test,
    })),
    evidence,
    unknowns: d.unknowns,
  };
}

export type AnalysisTable = { id: string; title: string; rows: string[] };

/** Readable tables from each file's analysis: ARR bridge, pipeline, segments, largest customers. */
export function analysisTables(files: { filename: string; analysis: FileAnalysis }[]): AnalysisTable[] {
  const out: Omit<AnalysisTable, "id">[] = [];
  for (const { filename, analysis: a } of files) {
    const b = a.bridge;
    if (b) {
      out.push({
        title: `ARR bridge, ${monthLabel(b.from)} – ${monthLabel(b.to)} (calculated from ${filename})`,
        rows: [
          `Starting ARR ${usd(b.startArr)} (${customers(b.customersStart)})`,
          `+ New ${usd(b.newArr)} (${customers(b.customersNew)})`,
          `+ Expansion ${usd(b.expansionArr)}`,
          `− Contraction ${usd(b.contractionArr)}`,
          `− Churn ${usd(b.churnedArr)} (${customers(b.customersChurned)})`,
          `= Ending ARR ${usd(b.endArr)} (${customers(b.customersEnd)})`,
        ],
      });
    }
    if (a.pipeline) {
      const p = a.pipeline;
      const dated = p.asOf !== "unknown";
      out.push({
        title: `Pipeline (calculated from ${filename})`,
        rows: [`${p.openCount} open deals worth ${usd(p.openAmount)}${dated ? ` as of ${p.asOf}` : ""}`, `${p.wonCount} won and ${p.lostCount} lost ${dated ? `in the 12 months to ${p.asOf}` : "in the file (no close dates)"}`],
      });
    }
    for (const s of a.segments ?? []) {
      out.push({
        title: `Win rate by ${s.dimension.toLowerCase()} (calculated from ${filename})`,
        rows: s.rows.map(
          (r) =>
            `${r.name}: ${r.winRate === null ? "no closed deals" : `${r.winRate}%`} (${r.won} won, ${r.lost} lost)${r.avgWonAmount ? `, average won deal ${usd(r.avgWonAmount)}` : ""}${r.medianCycleDays !== null ? `, median cycle ${r.medianCycleDays} days` : ""}${r.smallSample ? ", too few deals to compare" : ""}`,
        ),
      });
    }
    if (a.topCustomers?.length) {
      out.push({ title: `Largest customers by ARR (calculated from ${filename})`, rows: a.topCustomers.slice(0, 5).map((c) => `${c.name}: ${usd(c.arr)} (${c.share}% of ARR)`) });
    }
  }
  return out.slice(0, 10).map((t, i) => ({ id: `analysis:${i}`, ...t }));
}
