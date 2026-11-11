"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { FileText, Plus } from "lucide-react";
import { BILLING_CYCLES, contractBlobPrefix } from "@/lib/contracts";

export type ContractRow = {
  id: string;
  title: string;
  status: "draft" | "active" | "ended";
  cycle: string;
  amount: string | null;
  start: string | null;
  end: string | null;
  next: string | null;
  overdue: boolean;
  filename: string | null;
  notes: string | null;
};
type Result = { ok: true } | { ok: false; error: string };

const STATUS = { draft: "Draft", active: "Active", ended: "Ended" } as const;

/** Contracts and billing for one company: what's signed, how often it bills, and when next. */
export function ContractsPanel({ companyId, contracts, create, update, remove }: { companyId: string; contracts: ContractRow[]; create: (raw: unknown) => Promise<Result>; update: (id: string, change: "billed" | "active" | "ended") => Promise<void>; remove: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const submit = (fd: FormData) =>
    run(async () => {
      setError(null);
      const file = fd.get("file");
      let pathname: string | null = null;
      let filename: string | null = null;
      try {
        if (file instanceof File && file.size > 0) {
          const blob = await upload(`${contractBlobPrefix(companyId)}${file.name}`, file, { access: "private", handleUploadUrl: "/api/blob/upload" });
          pathname = blob.pathname;
          filename = file.name;
        }
      } catch {
        setError("The file didn't upload. PDF, Word or image files up to 25 MB.");
        return;
      }
      const s = (k: string) => String(fd.get(k) ?? "");
      const r = await create({ title: s("title"), status: s("status"), billingCycle: s("billingCycle"), amount: s("amount"), startDate: s("startDate"), endDate: s("endDate"), nextBillingDate: s("nextBillingDate"), notes: s("notes"), pathname, filename });
      if (!r.ok) setError(r.error);
      else {
        form.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });
  const act = (fn: () => Promise<void>) => run(async () => { await fn(); router.refresh(); });

  return (
    <div className="space-y-3">
      {contracts.length ? (
        <ul aria-label="Contracts" className="divide-y text-sm" style={{ borderColor: "var(--border)" }}>
          {contracts.map((c) => (
            <li key={c.id} className="py-3 flex gap-4 flex-wrap items-start" style={{ borderColor: "var(--border)", opacity: c.status === "ended" ? 0.65 : 1 }}>
              <div className="flex-1 min-w-[14rem]">
                <div className="font-semibold flex items-center gap-2 flex-wrap" style={{ color: "var(--foreground)" }}>
                  {c.title}
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: c.status === "active" ? "var(--green-muted)" : "var(--muted)", color: c.status === "active" ? "var(--green)" : "var(--muted-foreground)" }}>{STATUS[c.status]}</span>
                </div>
                <div style={{ color: "var(--muted-foreground)" }}>
                  {[c.amount && `${c.amount} ${c.cycle === "One-time" ? "one-time" : `· ${c.cycle.toLowerCase()}`}`, !c.amount && c.cycle, c.start && `from ${c.start}`, c.end && `to ${c.end}`].filter(Boolean).join(" · ")}
                </div>
                {c.next && <div className="text-sm" style={{ color: c.overdue ? "var(--red)" : "var(--foreground)" }}>Next billing: {c.next}{c.overdue ? " (overdue)" : ""}</div>}
                {c.notes && <div className="text-sm italic" style={{ color: "var(--muted-foreground)" }}>{c.notes}</div>}
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                {c.filename && (
                  <a href={`/api/contracts/${c.id}`} className="link inline-flex items-center gap-1"><FileText size={14} aria-hidden /> {c.filename}</a>
                )}
                {c.status === "active" && c.next && <button type="button" disabled={pending} className="link" onClick={() => act(() => update(c.id, "billed"))} aria-label={`Mark billed: ${c.title}`}>Mark billed</button>}
                {c.status !== "ended" ? (
                  <button type="button" disabled={pending} className="link" onClick={() => act(() => update(c.id, "ended"))}>End</button>
                ) : (
                  <button type="button" disabled={pending} className="link" onClick={() => act(() => update(c.id, "active"))}>Reactivate</button>
                )}
                <button type="button" disabled={pending} className="text-sm" style={{ color: "var(--red)" }} onClick={() => confirm(`Delete ${c.title} and its file?`) && act(() => remove(c.id))}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No contracts yet.</p>
      )}
      {open ? (
        <form ref={form} action={submit} aria-label="Add a contract" className="grid sm:grid-cols-2 gap-3 rounded-xl p-4" style={{ background: "var(--muted)" }}>
          <label className="text-sm sm:col-span-2">Name<input name="title" required maxLength={200} className="field w-full mt-1" placeholder="e.g. Execute & Monitor agreement" /></label>
          <label className="text-sm">Billing cycle
            <select name="billingCycle" className="field w-full mt-1" defaultValue="monthly">{BILLING_CYCLES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
          </label>
          <label className="text-sm">Amount per bill ($)<input name="amount" inputMode="decimal" className="field w-full mt-1" placeholder="1,199" /></label>
          <label className="text-sm">Start date<input type="date" name="startDate" className="field w-full mt-1" /></label>
          <label className="text-sm">End date (optional)<input type="date" name="endDate" className="field w-full mt-1" /></label>
          <label className="text-sm">Next billing date<input type="date" name="nextBillingDate" className="field w-full mt-1" /><span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Left empty, it&apos;s worked out from the start date and cycle.</span></label>
          <label className="text-sm">Status
            <select name="status" className="field w-full mt-1" defaultValue="active"><option value="active">Active</option><option value="draft">Draft</option><option value="ended">Ended</option></select>
          </label>
          <label className="text-sm sm:col-span-2">Signed contract (PDF, Word or image)<input type="file" name="file" accept=".pdf,.doc,.docx,image/png,image/jpeg" className="block mt-1 text-sm" /></label>
          <label className="text-sm sm:col-span-2">Notes<textarea name="notes" rows={2} maxLength={2000} className="field w-full mt-1" /></label>
          <div className="sm:col-span-2 flex gap-3 items-center">
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save contract"}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            {error && <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</span>}
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary inline-flex items-center gap-1.5" onClick={() => setOpen(true)}><Plus size={16} aria-hidden /> Add a contract</button>
      )}
    </div>
  );
}
