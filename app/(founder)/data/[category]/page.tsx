import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ItemCard } from "@/components/readiness/ItemCard";
import { ReadinessTabs } from "@/components/readiness/ReadinessTabs";
import { UploadButton } from "@/components/readiness/UploadButton";
import { getCategory, sourcesFor } from "@/lib/readiness";
import { loadReadiness, toRecord } from "../load";

// File reading runs after the upload action responds (next/server after()), within this budget.
export const maxDuration = 300;

export default async function ReadinessCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const category = getCategory((await params).category);
  if (!category) notFound();
  const data = await loadReadiness();
  if (!data) {
    return (
      <div className="p-8 max-w-4xl">
        <PageHeader title="Growth Data Readiness" subtitle="Your company isn't set up yet." />
      </div>
    );
  }
  const { readiness, blobPrefix, missingByCategory } = data;
  const rows = new Map(readiness.items.map((i) => [i.itemKey, i]));
  const progress = readiness.assessment.collection.byCategory.find((c) => c.id === category.id);
  const required = category.items.filter((i) => i.required);
  const optional = category.items.filter((i) => !i.required);

  const list = (items: typeof category.items) =>
    items.map((item) => (
      <ItemCard
        key={item.key}
        def={item}
        category={category.id}
        sources={sourcesFor(item, category)}
        record={toRecord(rows.get(item.key))}
        files={readiness.files.filter((f) => f.itemKeys.includes(item.key))}
        missingFields={readiness.missingFields[item.key] ?? []}
        blobPrefix={blobPrefix}
      />
    ));

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader eyebrow="Step 2 · Data Readiness" title={`${category.letter}. ${category.name}`} subtitle={category.summary} />
      <ReadinessTabs missingByCategory={missingByCategory} />

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="md:col-span-2 rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>Files that usually cover this</div>
          <ul className="text-sm list-disc pl-5 mb-3" style={{ color: "var(--foreground)" }}>
            {category.suggestedFiles.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
            Usually exported from {category.sources.join(", ")}. Imperfect or partial exports are fine; tell us what&apos;s missing below.
          </p>
          <UploadButton blobPrefix={blobPrefix} category={category.id} label={`Upload a ${category.name.toLowerCase()} file`} variant="primary" />
        </div>
        <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>This category</div>
          <div className="font-mono text-2xl font-semibold" style={{ color: "var(--foreground)" }}>{progress?.requiredPercent ?? 0}%</div>
          <div className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>of required items supplied (partial counts half)</div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {progress?.reviewed ?? 0} of {progress?.total ?? category.items.length} items reviewed
          </div>
        </div>
      </div>

      <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>Required ({required.length})</h2>
      <div className="space-y-3 mb-8">{list(required)}</div>
      {optional.length > 0 && (
        <>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>Optional ({optional.length})</h2>
          <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>These sharpen the analysis but aren&apos;t needed to get started.</p>
          <div className="space-y-3">{list(optional)}</div>
        </>
      )}
    </div>
  );
}
