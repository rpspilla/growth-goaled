"use client";

import type { DocumentView } from "@/lib/data/documents";
import { DocumentCard } from "./DocumentCard";
import { useProcessingRefresh } from "./useProcessingRefresh";

export function FileList({ documents }: { documents: DocumentView[] }) {
  useProcessingRefresh(documents.some((d) => d.status === "uploaded" || d.status === "analyzing"));
  if (documents.length === 0) {
    return <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No files uploaded yet.</p>;
  }
  return (
    <div className="space-y-3">
      {documents.map((d) => <DocumentCard key={d.id} doc={d} />)}
    </div>
  );
}
