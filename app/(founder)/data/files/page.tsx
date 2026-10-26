import { PageHeader } from "@/components/PageHeader";
import { FileList } from "@/components/readiness/FileList";
import { InboxDropzone } from "@/components/readiness/InboxDropzone";
import { ReadinessTabs } from "@/components/readiness/ReadinessTabs";
import { listDocuments } from "@/lib/data/documents";
import { loadReadiness } from "../load";

// File reading runs after the upload action responds (next/server after()), within this budget.
export const maxDuration = 300;

export default async function FilesPage() {
  const data = await loadReadiness();
  if (!data) {
    return (
      <div className="p-8 max-w-4xl">
        <PageHeader title="Your files" subtitle="Your company isn't set up yet." />
      </div>
    );
  }
  const documents = await listDocuments(data.company);

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader eyebrow="Step 3 · Data" title="Your files" subtitle="Everything you've uploaded. Files are private to your company and your advisor." />
      <ReadinessTabs />
      <InboxDropzone blobPrefix={data.blobPrefix} />
      <FileList documents={documents} />
    </div>
  );
}
