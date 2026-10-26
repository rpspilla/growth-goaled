import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { PreliminaryTrigger } from "@/components/deliverables/PreliminaryTrigger";
import { BaselineMeter } from "@/components/readiness/BaselineMeter";
import { InboxDropzone } from "@/components/readiness/InboxDropzone";
import { ItemCard } from "@/components/readiness/ItemCard";
import { ReadinessTabs } from "@/components/readiness/ReadinessTabs";
import { SortReview } from "@/components/readiness/SortReview";
import { isStalled } from "@/lib/data/deliverables";
import { listDocuments } from "@/lib/data/documents";
import { founderContext } from "@/lib/data/founder-context";
import { latestPreliminary } from "@/lib/data/preliminary";
import { listRegisterItems } from "@/lib/data/registers";
import { getCategory, getItem, sourcesFor } from "@/lib/readiness";
import { baselineReadiness } from "@/lib/use-cases/readiness";
import { loadReadiness, toRecord } from "./load";

// File reading runs after the upload action responds (next/server after()), within this budget.
export const maxDuration = 300;

/** Step 3: only the data the active use case needs, in priority order (the layout guarantees one is active). */
export default async function DataPage() {
  const [data, { active }] = await Promise.all([loadReadiness(), founderContext()]);
  if (!data || !active) {
    return (
      <div className="p-8 max-w-4xl">
        <PageHeader title="Data" subtitle="Your company isn't set up yet. Contact your advisor if this persists." />
      </div>
    );
  }
  const { company, readiness, blobPrefix } = data;
  const useCase = active.def;
  const [documents, questions, prelim] = await Promise.all([
    listDocuments(company),
    listRegisterItems([company.id], { owner: "founder", status: "open" }),
    useCase.id === "growth_leak" ? latestPreliminary(company.id) : null,
  ]);
  const rows = new Map(readiness.items.map((i) => [i.itemKey, i]));
  const meter = baselineReadiness(useCase, Object.fromEntries(readiness.items.map((i) => [i.itemKey, i.status])));
  const filesWorking = documents.some((d) => d.status === "uploaded" || d.status === "analyzing" || (d.inbox && (d.sortStatus === "sorting" || d.sortStatus === null)));
  const prelimState = !prelim ? null : prelim.status === "drafting" || prelim.status === "qa" ? (isStalled(prelim) ? null : "building") : prelim.codeChecksPassed && (prelim.status === "in_review" || prelim.status === "approved") ? "ready" : null;
  const inbox = documents.filter((d) => d.inbox || d.suggestions.some((x) => x.status === "suggested"));

  const groups = [
    { title: "Needed for your baseline", caption: "We can't build your baseline without these.", keys: useCase.requiredItems, required: true },
    { title: "Sharpens it", caption: "Not required, but each one makes the answer more precise.", keys: useCase.helpfulItems, required: false },
    { title: "Optional extras", caption: "Useful if you have them to hand.", keys: useCase.optionalItems, required: false },
  ].filter((g) => g.keys.length);

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader eyebrow="Step 3 · Data" title={`Data for ${useCase.shortTitle}`} subtitle={`Only what we need to answer “${useCase.question}”`} />
      <ReadinessTabs questions={questions.length} />

      {useCase.id === "growth_leak" && (
        <>
          <PreliminaryTrigger filesWorking={filesWorking} />
          <BuildingRefresh active={prelimState === "building"} />
          {prelimState && (
            <Link href="/baseline" className="flex items-center gap-3 rounded-xl border p-4 mb-6" style={{ background: "var(--card)", borderColor: "var(--green)" }}>
              <span className="flex-1 text-sm" style={{ color: "var(--foreground)" }}>
                {prelimState === "building" ? "Building a preliminary baseline from what you've shared…" : "A preliminary baseline is ready from what you've shared so far."}
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--green)" }}>{prelimState === "building" ? "Track progress →" : "View it →"}</span>
            </Link>
          )}
        </>
      )}

      <BaselineMeter
        done={meter.done}
        total={meter.total}
        ready={meter.ready}
        canRequest={useCase.id === "growth_leak"}
        inProgress={active.status === "baseline_in_review"}
      />

      <InboxDropzone blobPrefix={blobPrefix} />
      <SortReview docs={inbox} />

      {questions.length > 0 && (
        <Link href="/data/questions" className="block rounded-xl border p-4 mb-6 text-sm" style={{ background: "var(--card)", borderColor: "var(--amber)", color: "var(--foreground)" }}>
          {questions.length} {questions.length === 1 ? "question needs" : "questions need"} your answer →
        </Link>
      )}

      {groups.map((g) => (
        <section key={g.title} className="mb-8">
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{g.title} ({g.keys.length})</h2>
          <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>{g.caption}</p>
          <div className="space-y-3">
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
