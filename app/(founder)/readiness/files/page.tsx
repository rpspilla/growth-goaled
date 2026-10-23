import { PageHeader } from "@/components/PageHeader";
import { FileList } from "@/components/readiness/FileList";
import { ReadinessTabs } from "@/components/readiness/ReadinessTabs";
import { UploadButton } from "@/components/readiness/UploadButton";
import { listDocuments } from "@/lib/data/documents";
import { CATEGORIES } from "@/lib/readiness";
import { loadReadiness } from "../load";

export const maxDuration = 300;

export default async function ReadinessFilesPage() {
  const data = await loadReadiness();
  if (!data) {
    return (
      <div className="p-8 max-w-4xl">
        <PageHeader title="Growth Data Readiness" subtitle="Your company isn't set up yet." />
      </div>
    );
  }
  const documents = await listDocuments(data.company);

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        eyebrow="Step 2 · Data Readiness"
        title="Your files"
        subtitle="Everything you've uploaded. Files are private to your company and your advisor."
      />
      <ReadinessTabs missingByCategory={data.missingByCategory} />

      <div className="rounded-xl border p-5 mb-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>Upload into a category</div>
        <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
          CSV and Excel files are read for columns, row counts and date ranges, then checked for metrics. PDFs are read for metrics.
          Word files are stored for your advisor but not analysed automatically. Uploading the same file twice links the existing copy.
        </p>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {CATEGORIES.map((c) => (
            <div key={c.id}>
              <div className="text-xs mb-1.5" style={{ color: "var(--muted-foreground)" }}>{c.letter}. {c.name}</div>
              <UploadButton blobPrefix={data.blobPrefix} category={c.id} />
            </div>
          ))}
        </div>
      </div>

      <FileList documents={documents} />
    </div>
  );
}
