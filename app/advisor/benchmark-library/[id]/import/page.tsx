import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ImportWizard } from "@/components/benchmark-library/ImportWizard";
import { requireRole } from "@/lib/auth/session";
import { getDataset } from "@/lib/data/benchmark-library";
import { commitImportAction, previewImportAction } from "../../actions";

/** CSV import for one dataset: rows go into its draft version (created from the published one if needed). */
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await getDataset(id) : null;
  if (!data) notFound();
  const draft = data.versions.find((v) => v.status === "draft" || v.status === "validated");
  const next = (data.versions[0]?.version ?? 0) + 1;
  const draftLabel = draft ? `draft version ${draft.version}` : `new draft version ${next}`;
  return (
    <div className="p-4 sm:p-8 max-w-6xl space-y-5">
      <Link href={`/advisor/benchmark-library/${id}`} className="text-sm" style={{ color: "var(--green)" }}>← {data.dataset.name}</Link>
      <PageHeader eyebrow="Import CSV" title={data.dataset.name} subtitle={`Rows are checked one by one and saved to the ${draftLabel}${draft ? "" : " (a copy of the published version)"}. Nothing changes what customers see until you validate and publish.`} />
      {data.dataset.archivedAt ? <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>This dataset is archived.</p> : <ImportWizard datasetId={id} draftLabel={draftLabel} preview={previewImportAction} commit={commitImportAction} />}
    </div>
  );
}
