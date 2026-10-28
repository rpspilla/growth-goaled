"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inputClass, inputStyle, primary, secondary } from "@/components/benchmarks/ui";
import type { archiveDatasetAction, openDraftAction, versionAction } from "@/app/advisor/benchmark-library/actions";

type R = { ok: true } | { ok: false; error: string };

/** The buttons for one version's lifecycle: validate → publish; review, archive; start a new draft. */
export function VersionActions({
  datasetId,
  versionId,
  status,
  hasDraft,
  datasetArchived,
  act,
  openDraft,
  archiveDataset,
}: {
  datasetId: string;
  versionId: string;
  status: "draft" | "validated" | "published" | "archived";
  hasDraft: boolean;
  datasetArchived: boolean;
  act: typeof versionAction;
  openDraft: typeof openDraftAction;
  archiveDataset: typeof archiveDatasetAction;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [effective, setEffective] = useState("");
  const [note, setNote] = useState("");
  const router = useRouter();
  const run = (fn: () => Promise<R & { versionId?: string }>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
      if (r.ok && r.versionId) router.push(`/advisor/benchmark-library/${datasetId}?v=${r.versionId}`);
      else router.refresh();
    });
  if (datasetArchived) return <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>This dataset is archived. Reports that used it keep their copy.</p>;
  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      {(status === "draft" || status === "validated") && (
        <button type="button" disabled={pending} onClick={() => run(() => act(datasetId, versionId, "validate"), "Validated: ready to publish.")} className="px-3 py-1.5 rounded-md font-semibold disabled:opacity-50" style={status === "draft" ? primary : secondary}>
          Validate
        </button>
      )}
      {status === "validated" && (
        <>
          <label className="sr-only" htmlFor="effective">Effective date</label>
          <input id="effective" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} className={inputClass} style={{ ...inputStyle, width: "auto" }} title="Effective date (optional)" />
          <button type="button" disabled={pending} onClick={() => run(() => act(datasetId, versionId, "publish", effective || undefined), "Published. New assessments will use it.")} className="px-3 py-1.5 rounded-md font-semibold disabled:opacity-50" style={primary}>
            Publish
          </button>
        </>
      )}
      {status === "published" && (
        <>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (optional)" aria-label="Review note" className={inputClass} style={{ ...inputStyle, width: "14rem" }} />
          <button type="button" disabled={pending} onClick={() => run(() => act(datasetId, versionId, "review", note), "Marked reviewed.")} className="px-3 py-1.5 rounded-md font-semibold disabled:opacity-50" style={secondary}>
            Mark reviewed
          </button>
          {!hasDraft && (
            <button type="button" disabled={pending} onClick={() => run(() => openDraft(datasetId), "New draft created.")} className="px-3 py-1.5 rounded-md font-semibold disabled:opacity-50" style={secondary}>
              New version
            </button>
          )}
        </>
      )}
      {status !== "archived" && (
        <button type="button" disabled={pending} onClick={() => confirm("Archive this version? It stops being used for new assessments.") && run(() => act(datasetId, versionId, "archive"), "Version archived.")} className="px-3 py-1.5 rounded-md disabled:opacity-50" style={secondary}>
          Archive version
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => confirm("Archive the whole dataset? New assessments stop using it; existing reports keep their copy.") && run(() => archiveDataset(datasetId), "Dataset archived.")} className="px-3 py-1.5 rounded-md disabled:opacity-50 ml-auto" style={{ color: "var(--red)" }}>
        Archive dataset
      </button>
      {msg && <span className="w-full text-sm" role={msg.ok ? "status" : "alert"} style={{ color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</span>}
    </div>
  );
}
