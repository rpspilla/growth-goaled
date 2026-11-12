"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { FileText, Loader2, UploadCloud } from "lucide-react";
import { useProcessingRefresh } from "@/components/readiness/useProcessingRefresh";
import { BILLING_CYCLES, contractBlobPrefix } from "@/lib/contracts";

export type ContractRow = {
  id: string;
  title: string;
  status: "draft" | "active" | "ended";
  cycleId: string;
  cycle: string;
  amount: string | null;
  amountRaw: string;
  start: string | null;
  end: string | null;
  next: string | null;
  overdue: boolean;
  filename: string | null;
  notes: string | null;
  keyTerms: string | null;
  readStatus: "reading" | "done" | "failed" | null;
  readError: string | null;
};
type Result = { ok: true } | { ok: false; error: string };

const STATUS = { draft: "Draft", active: "Active", ended: "Ended" } as const;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt";
const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };
const fmtDay = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null);

/** The same fields for adding by hand and for correcting what was read. */
function ContractFields({ c }: { c?: ContractRow }) {
  const f = "field w-full mt-1";
  return (
    <>
      <label className="text-sm sm:col-span-2">Name<input name="title" required maxLength={200} defaultValue={c?.title} className={f} placeholder="e.g. Execute & Monitor agreement" /></label>
      <label className="text-sm">Billing cycle
        <select name="billingCycle" className={f} defaultValue={c?.cycleId ?? "monthly"}>{BILLING_CYCLES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
      </label>
      <label className="text-sm">Amount per bill ($)<input name="amount" inputMode="decimal" defaultValue={c?.amountRaw} className={f} placeholder="1,199" /></label>
      <label className="text-sm">Start date<input type="date" name="startDate" defaultValue={c?.start ?? ""} className={f} /></label>
      <label className="text-sm">End date (optional)<input type="date" name="endDate" defaultValue={c?.end ?? ""} className={f} /></label>
      <label className="text-sm">Next billing date<input type="date" name="nextBillingDate" defaultValue={c?.next ?? ""} className={f} /><span className="text-xs" style={muted}>Left empty, it&apos;s worked out from the start date and cycle.</span></label>
      <label className="text-sm">Status
        <select name="status" className={f} defaultValue={c?.status ?? "active"}><option value="active">Active</option><option value="draft">Draft</option><option value="ended">Ended</option></select>
      </label>
      <label className="text-sm sm:col-span-2">Notes<textarea name="notes" rows={2} maxLength={2000} defaultValue={c?.notes ?? ""} className={f} /></label>
    </>
  );
}

const fields = (fd: FormData) => {
  const s = (k: string) => String(fd.get(k) ?? "");
  return { title: s("title"), status: s("status"), billingCycle: s("billingCycle"), amount: s("amount"), startDate: s("startDate"), endDate: s("endDate"), nextBillingDate: s("nextBillingDate"), notes: s("notes") };
};

/**
 * Contracts and billing for one company. Drop the signed contract (or click to choose): it's
 * saved, then read, and its details and key terms appear here so nobody has to open the file.
 */
export function ContractsPanel({
  companyId,
  contracts,
  uploaded,
  create,
  edit,
  reread,
  update,
  remove,
}: {
  companyId: string;
  contracts: ContractRow[];
  uploaded: (pathname: string, filename: string) => Promise<Result>;
  create: (raw: unknown) => Promise<Result>;
  edit: (id: string, raw: unknown) => Promise<Result>;
  reread: (id: string) => Promise<void>;
  update: (id: string, change: "billed" | "active" | "ended") => Promise<void>;
  remove: (id: string) => Promise<void>;
}) {
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [uploads, setUploads] = useState<{ name: string; state: "uploading" | "error"; error?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const picker = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useProcessingRefresh(contracts.some((c) => c.readStatus === "reading"));

  const send = async (files: File[]) => {
    if (!files.length) return;
    setUploads(files.map((f) => ({ name: f.name, state: "uploading" })));
    for (const [i, file] of files.slice(0, 10).entries()) {
      const mark = (patch: Partial<{ state: "uploading" | "error"; error: string }>) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error("Files can be up to 25 MB.");
        const blob = await upload(`${contractBlobPrefix(companyId)}${file.name}`, file, { access: "private", handleUploadUrl: "/api/blob/upload" });
        const r = await uploaded(blob.pathname, file.name);
        if (!r.ok) throw new Error(r.error);
        setUploads((u) => u.filter((x) => x.name !== file.name));
      } catch (err) {
        mark({ state: "error", error: err instanceof Error && err.message.length < 200 ? err.message : "Upload failed. PDF, Word or image files up to 25 MB." });
      }
    }
    router.refresh();
  };
  const act = (fn: () => Promise<unknown>) => run(async () => { await fn(); router.refresh(); });

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a contract here, or choose a file"
        onClick={() => picker.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), picker.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void send(Array.from(e.dataTransfer.files ?? []));
        }}
        className="rounded-xl p-6 flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition-colors"
        style={{ border: `2px dashed ${over ? "var(--green)" : "var(--border)"}`, background: over ? "var(--green-muted)" : "var(--muted)" }}
      >
        <UploadCloud size={26} aria-hidden style={{ color: over ? "var(--green)" : "var(--muted-foreground)" }} />
        <div className="font-semibold" style={fg}>{over ? "Drop to add the contract" : "Drag and drop a signed contract here"}</div>
        <div className="text-sm" style={muted}>or click to choose · PDF or image · we read it and fill in the details</div>
        <input ref={picker} type="file" multiple accept={ACCEPT} aria-label="Contract file" onClick={(e) => e.stopPropagation()} onChange={(e) => void send(Array.from(e.target.files ?? []))} className="sr-only" tabIndex={-1} />
      </div>
      {uploads.map((u) => (
        <p key={u.name} role={u.state === "error" ? "alert" : "status"} className="text-sm flex items-center gap-2" style={{ color: u.state === "error" ? "var(--red)" : "var(--muted-foreground)" }}>
          {u.state === "uploading" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
          {u.state === "uploading" ? `Uploading ${u.name}…` : `${u.name}: ${u.error}`}
        </p>
      ))}

      {contracts.length ? (
        <ul aria-label="Contracts" className="space-y-3">
          {contracts.map((c) => (
            <li key={c.id} aria-label={c.title} className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--border)", opacity: c.status === "ended" ? 0.7 : 1 }}>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[14rem]">
                  <div className="font-semibold flex items-center gap-2 flex-wrap" style={fg}>
                    {c.title}
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: c.status === "active" ? "var(--green-muted)" : "var(--muted)", color: c.status === "active" ? "var(--green)" : "var(--muted-foreground)" }}>{STATUS[c.status]}</span>
                  </div>
                  {c.readStatus === "reading" && (
                    <p role="status" className="text-sm flex items-center gap-1.5 mt-0.5" style={muted}><Loader2 size={13} className="animate-spin" aria-hidden /> Reading the contract…</p>
                  )}
                  {c.readStatus === "failed" && (
                    <p className="text-sm mt-0.5" style={{ color: "var(--amber)" }}>
                      {c.readError ?? "Couldn't read this contract."}{" "}
                      <button type="button" className="link" onClick={() => act(() => reread(c.id))}>Try again</button>
                    </p>
                  )}
                </div>
                {c.filename && <a href={`/api/contracts/${c.id}`} className="link text-sm inline-flex items-center gap-1"><FileText size={14} aria-hidden /> {c.filename}</a>}
              </div>
              {c.readStatus !== "reading" && (
                <dl aria-label={`${c.title} details`} className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                  <div><dt className="text-xs" style={muted}>Amount</dt><dd style={fg}>{c.amount ? `${c.amount}${c.cycleId === "one_time" ? " one-time" : ` · ${c.cycle.toLowerCase()}`}` : "—"}</dd></div>
                  <div><dt className="text-xs" style={muted}>Billing</dt><dd style={fg}>{c.cycle}</dd></div>
                  <div><dt className="text-xs" style={muted}>Term</dt><dd style={fg}>{c.start ? `${fmtDay(c.start)} – ${fmtDay(c.end) ?? "ongoing"}` : "—"}</dd></div>
                  <div><dt className="text-xs" style={muted}>Next billing</dt><dd style={{ color: c.overdue ? "var(--red)" : "var(--foreground)" }}>{c.next ? `${fmtDay(c.next)}${c.overdue ? " (overdue)" : ""}` : "—"}</dd></div>
                </dl>
              )}
              {c.keyTerms && (
                <div className="text-sm rounded-lg p-3" style={{ background: "var(--muted)" }}>
                  <div className="text-xs font-semibold mb-1" style={muted}>Key terms</div>
                  <ul className="space-y-0.5" style={fg}>{c.keyTerms.split("\n").filter(Boolean).map((l) => <li key={l}>{l.replace(/^[-•]\s*/, "")}</li>)}</ul>
                </div>
              )}
              {c.notes && <div className="text-sm italic" style={muted}>{c.notes}</div>}
              {editing === c.id ? (
                <form
                  aria-label={`Edit ${c.title}`}
                  className="grid sm:grid-cols-2 gap-3 rounded-xl p-4"
                  style={{ background: "var(--muted)" }}
                  action={(fd) =>
                    run(async () => {
                      setError(null);
                      const r = await edit(c.id, fields(fd));
                      if (r.ok) {
                        setEditing(null);
                        router.refresh();
                      } else setError(r.error);
                    })
                  }
                >
                  <ContractFields c={c} />
                  <div className="sm:col-span-2 flex gap-3 items-center">
                    <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save details"}</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                    {error && <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</span>}
                  </div>
                </form>
              ) : (
                <div className="flex gap-3 items-center flex-wrap text-sm">
                  <button type="button" className="link" onClick={() => setEditing(c.id)} aria-label={`Edit details: ${c.title}`}>Edit details</button>
                  {c.status === "active" && c.next && <button type="button" disabled={pending} className="link" onClick={() => act(() => update(c.id, "billed"))} aria-label={`Mark billed: ${c.title}`}>Mark billed</button>}
                  {c.status !== "ended" ? (
                    <button type="button" disabled={pending} className="link" onClick={() => act(() => update(c.id, "ended"))}>End</button>
                  ) : (
                    <button type="button" disabled={pending} className="link" onClick={() => act(() => update(c.id, "active"))}>Reactivate</button>
                  )}
                  <button type="button" disabled={pending} style={{ color: "var(--red)" }} onClick={() => confirm(`Delete ${c.title} and its file?`) && act(() => remove(c.id))}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={muted}>No contracts yet.</p>
      )}

      {manual ? (
        <form
          aria-label="Add a contract"
          className="grid sm:grid-cols-2 gap-3 rounded-xl p-4"
          style={{ background: "var(--muted)" }}
          action={(fd) =>
            run(async () => {
              setError(null);
              const r = await create({ ...fields(fd), pathname: null, filename: null });
              if (r.ok) {
                setManual(false);
                router.refresh();
              } else setError(r.error);
            })
          }
        >
          <ContractFields />
          <div className="sm:col-span-2 flex gap-3 items-center">
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save contract"}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setManual(false)}>Cancel</button>
            {error && <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</span>}
          </div>
        </form>
      ) : (
        <button type="button" className="link text-sm" onClick={() => setManual(true)}>No file? Enter a contract by hand</button>
      )}
    </div>
  );
}
