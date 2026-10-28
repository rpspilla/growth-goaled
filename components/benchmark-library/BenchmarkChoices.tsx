"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { card, inputClass, inputStyle, primary } from "@/components/benchmarks/ui";

export type ChoiceRow = {
  metric: string;
  label: string;
  auto: string;
  autoQuality: "strong" | "directional" | null;
  current: { choice: string; reason: string } | null;
  options: { recordId: string; label: string; excludedBecause: string | null }[];
};

function Row({ companyId, r, save }: { companyId: string; r: ChoiceRow; save: (companyId: string, metric: string, choice: string, reason: string) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const [choice, setChoice] = useState(r.current?.choice ?? "auto");
  const [reason, setReason] = useState(r.current?.reason ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <li className="py-3 border-t first:border-t-0 text-sm" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold" style={{ color: "var(--foreground)" }}>{r.label}</span>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Automatic: {r.auto}{r.autoQuality === "directional" ? " (directional)" : ""}</span>
      </div>
      <div className="flex gap-2 flex-wrap items-center mt-1.5">
        <label className="sr-only" htmlFor={`choice-${r.metric}`}>Benchmark for {r.label}</label>
        <select id={`choice-${r.metric}`} value={choice} onChange={(e) => setChoice(e.target.value)} className={inputClass} style={{ ...inputStyle, width: "auto", maxWidth: "28rem" }}>
          <option value="auto">Automatic matching</option>
          <option value="none">Don&apos;t benchmark this metric</option>
          {r.options.map((o) => <option key={o.recordId} value={o.recordId}>{o.label}{o.excludedBecause ? ` (outside automatic match: ${o.excludedBecause})` : ""}</option>)}
        </select>
        {choice !== "auto" && <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (kept with the report)" aria-label={`Reason for ${r.label}`} className={inputClass} style={{ ...inputStyle, width: "16rem" }} />}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await save(companyId, r.metric, choice, reason);
              setMsg(res.ok ? { ok: true, text: "Saved. Used from the next brief." } : { ok: false, text: res.error });
              if (res.ok) router.refresh();
            })
          }
          className="px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50"
          style={primary}
        >
          Save
        </button>
        {msg && <span className="text-xs" role={msg.ok ? "status" : "alert"} style={{ color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</span>}
      </div>
    </li>
  );
}

/** Per-metric benchmark choices for one company. Briefs already built keep the benchmarks they used. */
export function BenchmarkChoices({ companyId, rows, save }: { companyId: string; rows: ChoiceRow[]; save: (companyId: string, metric: string, choice: string, reason: string) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  if (!rows.length) return null;
  return (
    <section className="rounded-xl border p-5" style={card} aria-label="Benchmarks for this company">
      <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Benchmarks for this company</div>
      <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--muted-foreground)" }}>
        Matching is automatic. Override it when the automatic match is inappropriate; units and period bases must still be compatible. Changes apply to the next brief only.
      </p>
      <ul>{rows.map((r) => <Row key={r.metric} companyId={companyId} r={r} save={save} />)}</ul>
    </section>
  );
}
