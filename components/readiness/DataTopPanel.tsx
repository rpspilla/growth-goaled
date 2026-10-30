import { BaselineMeter } from "@/components/readiness/BaselineMeter";
import { KeyFileCard } from "@/components/readiness/KeyFileCard";
import { InboxDropzone } from "@/components/readiness/InboxDropzone";
import { SortReview } from "@/components/readiness/SortReview";
import { founderAssessment, salesCallCount } from "@/lib/data/assessments";
import { listDocuments } from "@/lib/data/documents";
import { founderContext } from "@/lib/data/founder-context";
import { baselineReadiness } from "@/lib/use-cases/readiness";
import { loadReadiness } from "@/app/(founder)/data/load";

/**
 * The top of every Data page (Step 3): upload files, sort what was uploaded, and run or re-run the
 * report, in the same place whichever tab the founder is on.
 */
export async function DataTopPanel() {
  const [data, { active }] = await Promise.all([loadReadiness(), founderContext()]);
  if (!data || !active) return null;
  const needed = active.def.salesCallsExpected;
  const [documents, assessment, callCount] = await Promise.all([listDocuments(data.company), founderAssessment(data.company.id, active.def.id), needed ? salesCallCount(data.company) : 0]);
  const meter = baselineReadiness(active.def, Object.fromEntries(data.readiness.items.map((i) => [i.itemKey, i.status])));
  const inbox = documents.filter((d) => d.inbox || d.suggestions.some((x) => x.status === "suggested"));
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start mb-8">
      <div className="min-w-0 space-y-4">
        {active.def.keyFile && <KeyFileCard keyFile={active.def.keyFile} files={data.readiness.files} inAlready={meter.ready} blobPrefix={data.blobPrefix} />}
        {active.def.keyFile && (
          <div className="label" style={{ color: "var(--muted-foreground)" }}>
            Anything else? Drop it here and we&apos;ll sort it
          </div>
        )}
        <InboxDropzone blobPrefix={data.blobPrefix} />
        <SortReview docs={inbox} />
      </div>
      <div className="lg:sticky lg:top-6">
        <BaselineMeter done={meter.done} total={meter.total} ready={meter.ready} assessment={assessment.state} calls={needed ? { count: callCount, needed } : undefined} />
      </div>
    </div>
  );
}
