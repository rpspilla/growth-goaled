"use client";

import { useState, useTransition } from "react";
import { ITEM_STATUS_LABEL, QUALITY_LABEL, type ItemQuality, type ItemStatus } from "@/lib/readiness";

export type ReviewItem = {
  key: string;
  name: string;
  category: string;
  required: boolean;
  status: ItemStatus;
  quality: ItemQuality;
  coverage: string | null;
  sourceSystem: string | null;
  limitations: string | null;
  followUp: string | null;
  defaultFollowUp: string;
  files: number;
};

type Review = (companyId: string, key: string, patch: { quality?: ItemQuality; followUp?: string | null }) => Promise<{ ok: true } | { ok: false; error: string }>;

const STATUS_COLOR: Record<ItemStatus, string> = {
  not_reviewed: "var(--muted-foreground)",
  available: "var(--green)",
  partial: "var(--amber)",
  missing: "var(--red)",
  not_applicable: "var(--muted-foreground)",
};

function Row({ companyId, item, review }: { companyId: string; item: ReviewItem; review: Review }) {
  const [pending, startTransition] = useTransition();
  const [ask, setAsk] = useState(false);
  const [text, setText] = useState(item.followUp ?? item.defaultFollowUp);
  const [error, setError] = useState<string | null>(null);
  const supplied = item.status === "available" || item.status === "partial";
  const go = (patch: Parameters<Review>[2]) =>
    startTransition(async () => {
      setError(null);
      const r = await review(companyId, item.key, patch);
      if (!r.ok) setError(r.error);
      else setAsk(false);
    });
  const btn = "text-xs px-2 py-1 rounded-md border disabled:opacity-60";

  return (
    <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm" style={{ color: "var(--foreground)" }}>
            {item.name}
            {item.required && <span className="text-xs ml-1.5 font-semibold" style={{ color: "var(--muted-foreground)" }}>req</span>}
          </div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            <span style={{ color: STATUS_COLOR[item.status] }}>{ITEM_STATUS_LABEL[item.status]}</span>
            {supplied && <> · <span style={{ color: item.quality === "validated" ? "var(--green)" : undefined }}>{QUALITY_LABEL[item.quality]}</span></>}
            {item.sourceSystem && ` · ${item.sourceSystem}`}
            {item.coverage && ` · ${item.coverage}`}
            {item.files > 0 && ` · ${item.files} file${item.files === 1 ? "" : "s"}`}
          </div>
          {item.limitations && <div className="text-xs mt-0.5" style={{ color: "var(--amber)" }}>Limitation: {item.limitations}</div>}
          {item.followUp && !ask && <div className="text-xs mt-0.5" style={{ color: "var(--foreground)" }}>Your request: {item.followUp}</div>}
        </div>
        <div className="flex gap-1.5 shrink-0">
          {supplied && item.quality !== "validated" && (
            <button disabled={pending} onClick={() => go({ quality: "validated" })} className={btn} style={{ borderColor: "var(--green)", color: "var(--green)" }}>Validate</button>
          )}
          {supplied && item.quality === "validated" && (
            <button disabled={pending} onClick={() => go({ quality: "unverified" })} className={btn} style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Unvalidate</button>
          )}
          <button disabled={pending} onClick={() => setAsk(!ask)} className={btn} style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
            {item.followUp ? "Edit request" : "Request"}
          </button>
        </div>
      </div>
      {ask && (
        <div className="mt-2 flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} className="flex-1 text-sm rounded-md border px-2.5 py-1.5" style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }} />
          <button disabled={pending || !text.trim()} onClick={() => go({ followUp: text })} className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60" style={{ background: "var(--green)", color: "#fff" }}>Send</button>
          {item.followUp && <button disabled={pending} onClick={() => go({ followUp: null })} className="text-xs" style={{ color: "var(--muted-foreground)" }}>Clear</button>}
        </div>
      )}
      {error && <p className="text-xs mt-1" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}

/** Advisor-side readiness review: validate supplied data and send follow-up requests to the founder. */
export function ReadinessReview({ companyId, items, review }: { companyId: string; items: ReviewItem[]; review: Review }) {
  const [filter, setFilter] = useState<"supplied" | "gaps" | "all">("supplied");
  const shown = items.filter((i) =>
    filter === "all" ? true : filter === "supplied" ? i.status === "available" || i.status === "partial" : i.required && (i.status === "missing" || i.status === "not_reviewed" || i.status === "partial"),
  );
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
        <span className="label flex-1" style={{ color: "var(--muted-foreground)" }}>Data items</span>
        {(["supplied", "gaps", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="text-xs px-2.5 py-1 rounded-full capitalize" style={{ background: filter === f ? "var(--foreground)" : "transparent", color: filter === f ? "var(--background)" : "var(--muted-foreground)" }}>
            {f === "supplied" ? "To validate" : f === "gaps" ? "Required gaps" : "All"}
          </button>
        ))}
      </div>
      {shown.length === 0 && <div className="px-4 py-4 text-sm" style={{ color: "var(--muted-foreground)" }}>Nothing here.</div>}
      <div className="max-h-[32rem] overflow-y-auto">
        {shown.map((i) => <Row key={i.key} companyId={companyId} item={i} review={review} />)}
      </div>
    </div>
  );
}
