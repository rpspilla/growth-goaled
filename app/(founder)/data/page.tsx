import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DataTopPanel } from "@/components/readiness/DataTopPanel";
import { ItemCard } from "@/components/readiness/ItemCard";
import { ReadinessTabs } from "@/components/readiness/ReadinessTabs";
import { founderContext } from "@/lib/data/founder-context";
import { figureChoices } from "@/lib/data/figures";
import { FigureChecker } from "@/components/use-cases/FigureChecker";
import { assessmentMetrics } from "@/lib/use-cases";
import { chooseFigureAction, enterFigureAction } from "../baseline/actions";
import { listRegisterItems } from "@/lib/data/registers";
import { getCategory, getItem, sourcesFor } from "@/lib/readiness";
import { loadReadiness, toRecord } from "./load";

// File reading runs after the upload action responds (next/server after()), within this budget.
export const maxDuration = 300;

/** Step 3: only the data the active use case needs, in priority order (the layout guarantees one is active). */
export default async function DataPage() {
  const [data, { active }] = await Promise.all([loadReadiness(), founderContext()]);
  if (!data || !active) {
    return (
      <div className="px-4 sm:px-8 py-8 max-w-4xl">
        <PageHeader title="Data" subtitle="Your company isn't set up yet. Contact your advisor if this persists." />
      </div>
    );
  }
  const { company, readiness, blobPrefix } = data;
  const useCase = active.def;
  const [questions, choices] = await Promise.all([
    listRegisterItems([company.id], { owner: "founder", status: "open" }),
    figureChoices(company, assessmentMetrics(useCase, active.objective)),
  ]);
  const rows = new Map(readiness.items.map((i) => [i.itemKey, i]));

  const groups = [
    { title: "Needed for the assessment", caption: "Required", keys: useCase.requiredItems, required: true },
    { title: "Sharpens it", caption: "Optional · makes the answer more precise", keys: useCase.helpfulItems, required: false },
    { title: "Optional extras", caption: "If you have them to hand", keys: useCase.optionalItems, required: false },
  ].filter((g) => g.keys.length);

  return (
    <div className="px-4 sm:px-8 py-8 max-w-5xl">
      <PageHeader eyebrow="Step 3 of 5" title={`Data for ${useCase.shortTitle}`} subtitle="Only what this question needs." />
      <DataTopPanel />
      <ReadinessTabs questions={questions.length} />

      <div className="mb-6">
        <FigureChecker choices={choices} choose={chooseFigureAction} enter={enterFigureAction} />
      </div>

      {questions.length > 0 && (
        <Link href="/data/questions" className="block rounded-xl border p-4 mb-6 text-base font-semibold" style={{ background: "var(--card)", borderColor: "var(--amber)", color: "var(--foreground)" }}>
          {questions.length} {questions.length === 1 ? "question needs" : "questions need"} your answer →
        </Link>
      )}

      {groups.map((g) => (
        <section key={g.title} className="mb-8">
          <div className="flex items-baseline gap-2 flex-wrap mb-3">
            <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }} title={g.caption}>{g.title} ({g.keys.length})</h2>
            <span data-label className="text-xs" style={{ color: "var(--muted-foreground)" }}>{g.caption}</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3 items-start">
            {g.keys.flatMap((key) => {
              const def = getItem(key);
              const category = def && getCategory(def.category);
              if (!def || !category) return [];
              return [
                <ItemCard
                  key={key}
                  // "Required" means required for this use case's baseline, not the general checklist.
                  def={{ ...def, required: g.required }}
                  category={def.category}
                  sources={sourcesFor(def, category)}
                  record={toRecord(rows.get(key))}
                  files={readiness.files.filter((f) => f.itemKeys.includes(key))}
                  missingFields={readiness.missingFields[key] ?? []}
                  blobPrefix={blobPrefix}
                  why={useCase.itemWhy[key]}
                />,
              ];
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
