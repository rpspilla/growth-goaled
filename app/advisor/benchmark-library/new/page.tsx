import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DatasetForm } from "@/components/benchmark-library/DatasetForm";
import { requireRole } from "@/lib/auth/session";
import { listSources } from "@/lib/data/benchmark-library";
import { saveDatasetAction } from "../actions";

/** New dataset: pick (or first add) its source; version 1 starts as an empty draft. */
export default async function NewDatasetPage() {
  await requireRole(["admin"]);
  const sources = await listSources();
  return (
    <div className="p-4 sm:p-8 max-w-3xl space-y-5">
      <Link href="/advisor/benchmark-library" className="text-sm" style={{ color: "var(--green)" }}>← Benchmark Library</Link>
      <PageHeader eyebrow="Benchmark Library" title="New dataset" subtitle="A dataset is one source's set of benchmarks. Version 1 starts as a draft: add records by hand or import a CSV, then validate and publish." />
      {sources.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Add the source first. <Link href="/advisor/benchmark-library/sources?new" style={{ color: "var(--green)" }}>Add a source →</Link>
        </p>
      ) : (
        <>
          <DatasetForm sources={sources} action={saveDatasetAction} />
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Source not listed? <Link href="/advisor/benchmark-library/sources?new" style={{ color: "var(--green)" }}>Add it</Link>.</p>
        </>
      )}
    </div>
  );
}
