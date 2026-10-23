"use client";

import { useState } from "react";
import type { RegisterView } from "@/lib/data/registers";
import { REGISTER_TYPES, type RegisterType, type ResolveAction } from "@/lib/registers";
import { QuestionCard } from "./QuestionCard";

type Resolve = (itemId: string, action: ResolveAction) => Promise<{ ok: true } | { ok: false; error: string }>;

/** Founder Questions page: open questions to answer, and the registers they belong to. */
export function QuestionsView({ items, files, resolve }: { items: RegisterView[]; files: { id: string; filename: string }[]; resolve: Resolve }) {
  const [tab, setTab] = useState<"questions" | "registers">("questions");
  const [openType, setOpenType] = useState<RegisterType | null>(null);
  const open = items.filter((i) => i.status === "open");
  const closed = items.filter((i) => i.status !== "open");

  return (
    <>
      <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: "var(--muted)", width: "fit-content" }}>
        {(["questions", "registers"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              background: tab === t ? "var(--card)" : "transparent",
              color: tab === t ? "var(--foreground)" : "var(--muted-foreground)",
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {t === "questions" ? `Questions (${open.length})` : "Registers"}
          </button>
        ))}
      </div>

      {tab === "questions" ? (
        <div className="space-y-4">
          {open.length === 0 && (
            <div className="rounded-xl border p-6 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
              Nothing to answer right now. New questions appear here when your files disagree, a figure needs checking, or your advisor asks something.
            </div>
          )}
          {open.map((q) => <QuestionCard key={q.id} item={q} files={files} resolve={resolve} />)}
          {closed.length > 0 && (
            <details className="pt-4">
              <summary className="text-sm cursor-pointer" style={{ color: "var(--muted-foreground)" }}>Answered ({closed.length})</summary>
              <div className="space-y-3 mt-3">{closed.map((q) => <QuestionCard key={q.id} item={q} files={files} resolve={resolve} />)}</div>
            </details>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {REGISTER_TYPES.map((t) => {
            const all = items.filter((i) => i.type === t.id);
            const openCount = all.filter((i) => i.status === "open").length;
            const expanded = openType === t.id;
            return (
              <div key={t.id} className="rounded-xl border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                    <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{t.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-sm" style={{ color: openCount > 0 ? "var(--amber)" : "var(--green)" }}>{openCount}</span>
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>open · {all.length} total</span>
                    <button
                      disabled={!all.length}
                      onClick={() => setOpenType(expanded ? null : t.id)}
                      className="text-xs px-3 py-1 rounded-md disabled:opacity-50"
                      style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                    >
                      {expanded ? "Hide" : "View"}
                    </button>
                  </div>
                </div>
                {expanded && <div className="border-t p-4 space-y-3" style={{ borderColor: "var(--border)" }}>{all.map((q) => <QuestionCard key={q.id} item={q} files={files} resolve={resolve} />)}</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
