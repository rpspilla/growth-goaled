import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import type { ReadinessFile } from "@/lib/data/readiness";
import { getItem } from "@/lib/readiness";
import type { KeyFile } from "@/lib/use-cases/types";
import { StatusChip } from "@/components/visual/primitives";
import { UploadButton } from "./UploadButton";

const READ: Record<ReadinessFile["status"], string> = { uploaded: "queued", analyzing: "reading…", done: "read", failed: "couldn't be read", stored: "stored" };

/**
 * "Start here": the one file the first answer needs. Uploading it supplies every item it covers,
 * so there's nothing else to mark; the rest of the checklist only sharpens the answer.
 */
export function KeyFileCard({ keyFile, files, inAlready, blobPrefix }: { keyFile: KeyFile; files: ReadinessFile[]; inAlready: boolean; blobPrefix: string }) {
  const linked = files.filter((f) => f.itemKeys.some((k) => keyFile.items.includes(k)));
  const category = getItem(keyFile.items[0]!)!.category;
  return (
    <section className="surface p-5 sm:p-6" style={{ borderColor: inAlready ? "var(--green)" : "var(--amber)", borderWidth: 2 }} aria-labelledby="key-file">
      <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
        <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: inAlready ? "var(--green-muted)" : "var(--amber-muted)", color: inAlready ? "var(--green)" : "#92400E" }} aria-hidden>
          {inAlready ? <CheckCircle2 size={24} /> : <FileSpreadsheet size={24} />}
        </span>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="label" style={{ color: inAlready ? "var(--green)" : "#92400E" }}>
            Start here · the one file your answer needs
          </div>
          <h2 id="key-file" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
            {keyFile.label}
          </h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {keyFile.hint}
          </p>
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {inAlready ? <StatusChip status="in" word="In · ready to run" /> : <StatusChip status="missing" word="Not uploaded yet" />}
            <span data-label className="text-[11px] font-mono" style={{ color: "var(--subtle-foreground)" }}>
              CSV · XLSX · Google Sheets
            </span>
          </div>
          {linked.length > 0 && (
            <ul className="text-xs space-y-0.5 pt-1" style={{ color: "var(--muted-foreground)" }}>
              {linked.map((f) => (
                <li key={f.id}>
                  <span style={{ color: "var(--foreground)" }}>{f.filename}</span> · {READ[f.status]}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="shrink-0">
          <UploadButton blobPrefix={blobPrefix} category={category} itemKeys={[...keyFile.items]} label={inAlready ? "Upload a newer file" : "Upload your file"} variant="primary" />
        </div>
      </div>
    </section>
  );
}
