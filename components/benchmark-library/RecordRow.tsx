"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { RawRecord } from "@/lib/benchmark-library/records";
import type { deleteRecordAction, saveRecordAction } from "@/app/advisor/benchmark-library/actions";
import { RecordForm } from "./RecordForm";

/** One record in the table, with edit and remove when its version is still a draft. */
export function RecordRow({
  datasetId,
  recordId,
  editable,
  raw,
  children,
  save,
  remove,
}: {
  datasetId: string;
  recordId: string;
  editable: boolean;
  raw: RawRecord;
  children: ReactNode;
  save: typeof saveRecordAction;
  remove: typeof deleteRecordAction;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <li className="py-3 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0">{children}</div>
        {editable && !editing && (
          <div className="flex gap-2 shrink-0 text-xs">
            <button type="button" onClick={() => setEditing(true)} style={{ color: "var(--green)" }}>Edit</button>
            <button type="button" disabled={pending} onClick={() => confirm("Remove this record from the draft?") && start(async () => { await remove(datasetId, recordId); router.refresh(); })} style={{ color: "var(--red)" }}>
              Remove
            </button>
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-3">
          <RecordForm datasetId={datasetId} recordId={recordId} initial={raw} onDone={() => setEditing(false)} action={save} />
        </div>
      )}
    </li>
  );
}
