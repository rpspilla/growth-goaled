"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { DecisionResult } from "@/lib/data/deliverables";

type Edits = { headline: string; insightHeadline: string; insightBody: string; strengths: string[]; watchAreas: string[]; priority: string };

const input = "text-sm rounded-md border px-2.5 py-1.5 w-full";
const inputStyle = { background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" };
const btn = "px-4 py-2.5 rounded-lg text-sm font-medium border transition-all disabled:opacity-60";

/** Approve / Request changes (edit) / Send back to AI, and Publish once approved. */
export function ReviewActions({
  deliverableId,
  status,
  edits,
  approve,
  publish,
  sendBack,
  saveEdits,
}: {
  deliverableId: string;
  status: string;
  edits: Edits | null;
  approve: (id: string, note: string) => Promise<DecisionResult>;
  publish: (id: string) => Promise<DecisionResult>;
  sendBack: (id: string, note: string) => Promise<DecisionResult>;
  saveEdits: (id: string, e: Edits & { comment: string }) => Promise<DecisionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<null | "approve" | "edit" | "send_back">(null);
  const [note, setNote] = useState("");
  const [form, setForm] = useState<Edits | null>(edits);
  const [error, setError] = useState<string | null>(null);
  const working = status === "drafting" || status === "qa";

  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [working, router]);

  const run = (fn: () => Promise<DecisionResult>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setMode(null);
        setNote("");
        if (r.newId) router.push(`/advisor/review/${r.newId}`);
      }
    });

  if (working) return <p className="text-sm" style={{ color: "var(--amber)" }}>{status === "drafting" ? "Draft Agent is running..." : "QA Agent is checking the draft..."}</p>;
  if (status === "published") return <p className="text-sm font-semibold" style={{ color: "var(--green)" }}>Published. The founder can see this version.</p>;
  if (status !== "in_review" && status !== "approved") return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        {status === "in_review" ? (
          <button disabled={pending} onClick={() => setMode(mode === "approve" ? null : "approve")} className={btn} style={{ background: "var(--green)", color: "#fff", borderColor: "var(--green)" }}>
            Approve
          </button>
        ) : (
          <button disabled={pending} onClick={() => run(() => publish(deliverableId))} className={btn} style={{ background: "var(--green)", color: "#fff", borderColor: "var(--green)" }}>
            {pending ? "Publishing..." : "Publish to founder"}
          </button>
        )}
        {form && (
          <button disabled={pending} onClick={() => setMode(mode === "edit" ? null : "edit")} className={btn} style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
            Request changes (edit)
          </button>
        )}
        <button disabled={pending} onClick={() => setMode(mode === "send_back" ? null : "send_back")} className={btn} style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          Send back to AI
        </button>
      </div>
      {status === "approved" && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Approved. Publishing makes it visible to the founder.</p>}

      {mode === "approve" && (
        <div className="space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Note for the founder (shown with the approval, optional)" className={input} style={inputStyle} />
          <button disabled={pending} onClick={() => run(() => approve(deliverableId, note))} className="text-xs px-3 py-1.5 rounded-md font-semibold" style={{ background: "var(--green)", color: "#fff" }}>
            {pending ? "Approving..." : "Confirm approval"}
          </button>
        </div>
      )}
      {mode === "send_back" && (
        <div className="space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="What should the AI change?" className={input} style={inputStyle} />
          <button disabled={pending || !note.trim()} onClick={() => run(() => sendBack(deliverableId, note))} className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60" style={{ background: "var(--foreground)", color: "var(--background)" }}>
            {pending ? "Sending..." : "Send back and redraft"}
          </button>
        </div>
      )}
      {mode === "edit" && form && (
        <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Edits create a new version that goes through QA again. Figures in the table come from the data and can&apos;t be edited here.</p>
          <label className="block text-xs font-semibold" style={{ color: "var(--foreground)" }}>
            Headline
            <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className={`${input} mt-1`} style={inputStyle} />
          </label>
          <label className="block text-xs font-semibold" style={{ color: "var(--foreground)" }}>
            Key insight
            <input value={form.insightHeadline} onChange={(e) => setForm({ ...form, insightHeadline: e.target.value })} className={`${input} mt-1`} style={inputStyle} />
            <textarea value={form.insightBody} onChange={(e) => setForm({ ...form, insightBody: e.target.value })} rows={3} className={`${input} mt-1`} style={inputStyle} />
          </label>
          {(["strengths", "watchAreas"] as const).map((k) => (
            <div key={k}>
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--foreground)" }}>{k === "strengths" ? "Strengths" : "Watch areas"}</div>
              {form[k].map((v, i) => (
                <input
                  key={i}
                  value={v}
                  onChange={(e) => setForm({ ...form, [k]: form[k].map((x, j) => (j === i ? e.target.value : x)) })}
                  className={`${input} mb-1`}
                  style={inputStyle}
                />
              ))}
            </div>
          ))}
          <label className="block text-xs font-semibold" style={{ color: "var(--foreground)" }}>
            Priority
            <input value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={`${input} mt-1`} style={inputStyle} />
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="What you changed and why (optional)" className={input} style={inputStyle} />
          <button disabled={pending} onClick={() => run(() => saveEdits(deliverableId, { ...form, comment: note }))} className="text-xs px-3 py-1.5 rounded-md font-semibold" style={{ background: "var(--green)", color: "#fff" }}>
            {pending ? "Saving..." : "Save as new version"}
          </button>
        </div>
      )}
      {error && <p className="text-xs" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
