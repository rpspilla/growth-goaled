import { ExternalLink, FileText } from "lucide-react";
import type { ProjectDocument } from "@/lib/db/schema";
import { documentHref } from "@/lib/project-links";

/** The other documents an advisor shared on a project, easy to open. */
export function ProjectDocuments({ documents, project }: { documents: ProjectDocument[]; project: string }) {
  if (!documents.length) return null;
  return (
    <ul aria-label={`Documents for ${project}`} className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
      {documents.map((d) => (
        <li key={d.id}>
          <a href={documentHref(d)} target="_blank" rel="noopener" className="surface px-4 py-3 flex items-center gap-3 hover:bg-[var(--muted)]">
            {d.url ? <ExternalLink size={18} aria-hidden style={{ color: "var(--green)" }} /> : <FileText size={18} aria-hidden style={{ color: "var(--green)" }} />}
            <span className="text-base font-medium truncate" style={{ color: "var(--foreground)" }}>{d.title}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
