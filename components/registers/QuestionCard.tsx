"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { RegisterView } from "@/lib/data/registers";
import { METRICS, type MetricKey, type MetricUnit } from "@/lib/metrics";
import { describeResolution, registerTypeMeta, type ResolveAction } from "@/lib/registers";

const UNIT_HINT: Record<MetricUnit, string> = {
  usd: "in US dollars, e.g. 4200000",
  percent: "as a percentage, e.g. 72",
  days: "in days",
  months: "in months",
  count: "a whole number",
  ratio: "as a ratio, e.g. 1.4",
};

type Resolve = (itemId: string, action: ResolveAction) => Promise<{ ok: true } | { ok: false; error: string }>;

const btn = "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-60";
const btnStyle = { borderColor: "var(--border)", color: "var(--foreground)", background: "transparent" };
const input = "text-sm rounded-md border px-2.5 py-1.5";
const inputStyle = { background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" };

/** One open question with the ways to close it that make sense for its type and data. */
export function QuestionCard({
  item,
  files,
  resolve,
  companyName,
}: {
  item: RegisterView;
  files: { id: string; filename: string }[];
  resolve: Resolve;
  /** Set on the advisor view, where items from several companies are listed. */
  companyName?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<null | "value" | "answer" | "document" | "unknown">(null);
  const [text, setText] = useState("");
  const [fileId, setFileId] = useState(files[0]?.id ?? "");
  const meta = registerTypeMeta(item.type);
  const closed = item.status !== "open";
  const metric = item.points[0]?.metric as MetricKey | undefined;
  const unit = metric && METRICS[metric] ? METRICS[metric].unit : null;
  const live = item.points.filter((p) => p.status !== "rejected");

  function act(action: ResolveAction) {
    setError(null);
    startTransition(async () => {
      const r = await resolve(item.id, action);
      if (!r.ok) setError(r.error);
      else setMode(null);
    });
  }

  return (
    <div
      className="rounded-xl border p-5 transition-all"
      style={{
        background: closed ? "var(--green-muted)" : "var(--card)",
        borderColor: closed ? "var(--green)" : item.type === "conflict" ? "var(--amber)" : "var(--border)",
      }}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--muted)", color: meta.color }}>{meta.badge}</span>
        {companyName && <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{companyName}</span>}
        {item.owner === "advisor" && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>· advisor-owned</span>}
        {closed && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
            {item.status === "unknown" ? "Marked unknown" : "✓ Resolved"}
          </span>
        )}
      </div>
      <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>{item.title}</div>
      {item.description && <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>{item.description}</p>}

      {item.points.length > 0 && (
        <ul className="text-xs mb-4 space-y-1">
          {item.points.map((p) => (
            <li key={p.id} style={{ color: p.status === "rejected" ? "var(--muted-foreground)" : "var(--foreground)" }}>
              <span className="font-mono font-semibold">{p.display}</span>
              {p.period && p.period !== "Current" && ` · ${p.period}`} · {p.source}
              {p.status === "accepted" && <span style={{ color: "var(--green)" }}> · in use</span>}
              {p.status === "rejected" && " · set aside"}
            </li>
          ))}
        </ul>
      )}

      {closed ? (
        <div className="text-xs font-medium" style={{ color: "var(--green)" }}>{describeResolution(item.resolution)}</div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {item.type === "conflict" &&
              live.length > 1 &&
              live.map((p) => (
                <button key={p.id} disabled={pending} onClick={() => act({ kind: "choose", dataPointId: p.id })} className={btn} style={btnStyle}>
                  Use {p.source.toLowerCase().startsWith("your") ? "profile" : p.source} ({p.display})
                </button>
              ))}
            {item.type !== "conflict" && live.length > 0 && (
              <button disabled={pending} onClick={() => act({ kind: "confirm" })} className={btn} style={btnStyle}>
                Confirm {live.length === 1 ? live[0]!.display : "values"}
              </button>
            )}
            {unit && (
              <button disabled={pending} onClick={() => setMode(mode === "value" ? null : "value")} className={btn} style={btnStyle}>
                {item.type === "conflict" ? "Enter the correct value" : "Enter actual"}
              </button>
            )}
            {!unit && (
              <button disabled={pending} onClick={() => setMode(mode === "answer" ? null : "answer")} className={btn} style={btnStyle}>
                Answer
              </button>
            )}
            <button disabled={pending} onClick={() => setMode(mode === "document" ? null : "document")} className={btn} style={btnStyle}>
              Use uploaded data
            </button>
            <button disabled={pending} onClick={() => setMode(mode === "unknown" ? null : "unknown")} className={btn} style={{ ...btnStyle, color: "var(--muted-foreground)" }}>
              Mark as unknown
            </button>
          </div>

          {mode === "value" && unit && (
            <form
              className="mt-3 flex items-center gap-2 flex-wrap"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(text.replace(/[,$%\s]/g, ""));
                if (!text.trim() || !Number.isFinite(n)) return setError("Enter a number.");
                act({ kind: "value", value: n });
              }}
            >
              <input autoFocus inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} className={input} style={inputStyle} aria-label="Correct value" />
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{UNIT_HINT[unit]}</span>
              <button disabled={pending} className="text-xs px-3 py-1.5 rounded-md font-semibold" style={{ background: "var(--green)", color: "#fff" }}>Save</button>
            </form>
          )}
          {mode === "answer" && (
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                act({ kind: "answer", text });
              }}
            >
              <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3} className={`${input} w-full`} style={inputStyle} aria-label="Your answer" />
              <button disabled={pending || !text.trim()} className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60" style={{ background: "var(--green)", color: "#fff" }}>Save answer</button>
            </form>
          )}
          {mode === "document" && (
            <div className="mt-3">
              {files.length ? (
                <form
                  className="flex items-center gap-2 flex-wrap"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act({ kind: "document", documentId: fileId });
                  }}
                >
                  <select value={fileId} onChange={(e) => setFileId(e.target.value)} className={input} style={inputStyle} aria-label="File">
                    {files.map((f) => <option key={f.id} value={f.id}>{f.filename}</option>)}
                  </select>
                  <button disabled={pending} className="text-xs px-3 py-1.5 rounded-md font-semibold" style={{ background: "var(--green)", color: "#fff" }}>Use this file</button>
                  {!companyName && <Link href="/readiness/files" className="text-xs" style={{ color: "var(--green)" }}>Upload another →</Link>}
                </form>
              ) : (
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  No files yet.{" "}
                  {!companyName && (
                    <>
                      <Link href="/readiness/files" style={{ color: "var(--green)" }}>Upload one</Link>, then come back to link it.
                    </>
                  )}
                </p>
              )}
              {!companyName && <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Your advisor will check the file for the answer.</p>}
            </div>
          )}
          {mode === "unknown" && (
            <form
              className="mt-3 flex items-center gap-2 flex-wrap"
              onSubmit={(e) => {
                e.preventDefault();
                act({ kind: "unknown", note: text || undefined });
              }}
            >
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Optional: why it's unknown" className={`${input} flex-1 min-w-48`} style={inputStyle} />
              <button disabled={pending} className="text-xs px-3 py-1.5 rounded-md font-semibold" style={{ background: "var(--muted)", color: "var(--foreground)" }}>Mark unknown</button>
            </form>
          )}
        </>
      )}
      {error && <p className="text-xs mt-2" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
