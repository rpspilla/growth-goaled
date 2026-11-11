"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, Globe } from "lucide-react";

export type BoardStage = { id: string; name: string; kind: string };
export type Card = {
  id: string;
  name: string;
  company: { id: string; name: string; website: string | null } | null;
  jobTitle: string | null;
  category: string | null;
  subcategory: string | null;
  stageId: string | null;
  priority: "high" | "medium" | "low";
  owner: { id: string; name: string } | null;
  lastContacted: string | null;
  next: { title: string; due: string | null } | null;
  followUp: "overdue" | "today" | "upcoming" | "later" | "none";
};

const PRIORITY = { high: { label: "High", color: "var(--red)" }, medium: { label: "Medium", color: "var(--amber)" }, low: { label: "Low", color: "var(--muted-foreground)" } } as const;
const FOLLOW = { overdue: { color: "var(--red)", bg: "var(--red-muted, #FDECEC)" }, today: { color: "var(--amber)", bg: "var(--amber-muted)" }, upcoming: { color: "var(--green)", bg: "var(--green-muted)" }, later: { color: "var(--muted-foreground)", bg: "var(--muted)" }, none: { color: "var(--muted-foreground)", bg: "var(--muted)" } } as const;
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const host = (w: string) => w.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

/**
 * The CRM board: one column per pipeline stage, cards dragged between (and within) columns. Moves
 * show at once and are saved; a failed save puts the card back.
 */
export function CrmBoard({ stages, cards, move, sortable }: { stages: BoardStage[]; cards: Card[]; move: (contactId: string, stageId: string, beforeId: string | null) => Promise<{ ok: boolean; error?: string }>; sortable: boolean }) {
  const [items, setItems] = useState(cards);
  // New cards from the server (after a refresh or a filter) replace the local order.
  const [source, setSource] = useState(cards);
  if (source !== cards) {
    setSource(cards);
    setItems(cards);
  }
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ stage: string; before: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, run] = useTransition();
  const router = useRouter();

  const drop = (stageId: string, beforeId: string | null) => {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id || id === beforeId) return;
    const before = items;
    const card = items.find((c) => c.id === id);
    if (!card) return;
    const rest = items.filter((c) => c.id !== id);
    const at = beforeId ? rest.findIndex((c) => c.id === beforeId) : -1;
    const moved = { ...card, stageId };
    setItems(at < 0 ? [...rest, moved] : [...rest.slice(0, at), moved, ...rest.slice(at)]);
    run(async () => {
      setError(null);
      const r = await move(id, stageId, sortable ? beforeId : null);
      if (!r.ok) {
        setItems(before);
        setError(r.error ?? "That move wasn't saved.");
      }
      router.refresh();
    });
  };

  return (
    <div>
      {error && <p role="alert" className="text-sm mb-2" style={{ color: "var(--red)" }}>{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0" role="group" aria-label="CRM board">
        {stages.map((s) => {
          const col = items.filter((c) => c.stageId === s.id);
          const hot = over?.stage === s.id;
          return (
            <section
              key={s.id}
              aria-label={s.name}
              onDragOver={(e) => {
                e.preventDefault();
                if (over?.stage !== s.id || over.before !== null) setOver({ stage: s.id, before: null });
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(s.id, over?.stage === s.id ? over.before : null);
              }}
              className="w-72 shrink-0 rounded-xl p-2.5 flex flex-col max-h-[calc(100vh-14rem)]"
              style={{ background: hot ? "var(--green-muted)" : "var(--muted)", outline: hot ? "2px dashed var(--green)" : undefined }}
            >
              <h3 className="text-sm font-semibold px-1.5 pb-2 flex items-center justify-between" style={{ color: "var(--foreground)" }}>
                {s.name}
                <span className="text-xs font-medium px-1.5 rounded" style={{ background: "var(--card)", color: "var(--muted-foreground)" }}>{col.length}</span>
              </h3>
              <ol className="space-y-2 overflow-y-auto flex-1 min-h-[3rem]">
                {col.map((c) => {
                  const f = FOLLOW[c.followUp];
                  return (
                    <li
                      key={c.id}
                      draggable
                      aria-label={c.name}
                      onDragStart={(e) => {
                        setDragging(c.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", c.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (over?.before !== c.id) setOver({ stage: s.id, before: c.id });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        drop(s.id, c.id);
                      }}
                      className="rounded-lg cursor-grab active:cursor-grabbing"
                      style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: over?.before === c.id ? "0 -3px 0 var(--green)" : "0 1px 2px rgba(13,27,42,0.06)", opacity: dragging === c.id ? 0.4 : 1 }}
                    >
                      <Link href={`/advisor/crm/contacts/${c.id}`} className="block p-3 space-y-1">
                        <div className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: PRIORITY[c.priority].color }} title={`${PRIORITY[c.priority].label} priority`} aria-label={`${PRIORITY[c.priority].label} priority`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>{c.name}</div>
                            <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{[c.jobTitle, c.company?.name].filter(Boolean).join(" · ") || "No company yet"}</div>
                          </div>
                          {c.owner && (
                            <span className="w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0" style={{ background: "var(--navy)", color: "#fff" }} title={c.owner.name}>{initials(c.owner.name)}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 items-center">
                          {c.category && <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--blue-muted)", color: "var(--blue)" }}>{c.subcategory ?? c.category}</span>}
                          {c.company?.website && (
                            <span className="text-[11px] inline-flex items-center gap-0.5 truncate max-w-[9rem]" style={{ color: "var(--muted-foreground)" }}>
                              <Globe size={11} aria-hidden /> {host(c.company.website)}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between gap-2 text-[11px] pt-0.5" style={{ color: "var(--muted-foreground)" }}>
                          <span>{c.lastContacted ? `Last: ${short(c.lastContacted)}` : "Not contacted"}</span>
                          {c.next ? (
                            <span className="inline-flex items-center gap-1 px-1.5 rounded font-semibold" style={{ color: f.color, background: f.bg }} title={c.next.title}>
                              <CalendarClock size={11} aria-hidden /> {c.next.due ? (c.followUp === "overdue" ? `Overdue ${short(c.next.due)}` : c.followUp === "today" ? "Today" : short(c.next.due)) : "Next action set"}
                            </span>
                          ) : (
                            <span style={{ color: "var(--amber)" }}>No next action</span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
