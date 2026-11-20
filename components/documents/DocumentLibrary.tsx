"use client";

import { useState } from "react";
import { Check, ClipboardList, RefreshCw, Download, ExternalLink, File, FileImage, FileSpreadsheet, FileText, LayoutGrid, List, Presentation, X } from "lucide-react";

export type PlanRow = { id: string; title: string; tier: string; status: string; date: string; href: string };
export type FileRow = {
  id: string;
  filename: string;
  kind: string;
  size: string;
  date: string;
  status: string;
  failed: boolean;
  source: { label: string; href: string | null };
  downloadHref: string;
  /** Opens in a new tab (PDFs and images); other files download. */
  previewHref: string | null;
  sourceUrl: string | null;
};

const card = { background: "var(--card)", borderColor: "var(--border)" };
const muted = { color: "var(--muted-foreground)" };

/** Google Drive's file-type colours, so a file's kind reads at a glance. */
const TYPES: Record<string, { Icon: typeof File; color: string }> = {
  Spreadsheet: { Icon: FileSpreadsheet, color: "#188038" },
  CSV: { Icon: FileSpreadsheet, color: "#188038" },
  PDF: { Icon: FileText, color: "#d93025" },
  Document: { Icon: FileText, color: "#1a73e8" },
  Text: { Icon: FileText, color: "#5f6368" },
  Slides: { Icon: Presentation, color: "#f9ab00" },
  Image: { Icon: FileImage, color: "#d93025" },
};
const typeOf = (kind: string) => TYPES[kind] ?? { Icon: File, color: "#5f6368" };

function TypeIcon({ kind, size }: { kind: string; size: number }) {
  const { Icon, color } = typeOf(kind);
  return <Icon size={size} aria-hidden style={{ color }} className="shrink-0" />;
}

type View = "grid" | "list";

/** Download several files: one link click each (browsers allow this for same-origin attachments). */
function downloadAll(files: FileRow[]) {
  for (const f of files) {
    const a = document.createElement("a");
    a.href = f.downloadHref;
    a.download = f.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/**
 * A company's documents, laid out like Google Drive: action plans on top, then the files shared as a
 * grid of tiles (or a list), coloured by type. Click a tile to select it (several with the checkbox),
 * double-click to open; the bar above acts on the selection.
 */
export function DocumentLibrary({
  plans,
  files,
  emptyPlans,
  reread,
}: {
  plans: PlanRow[];
  files: FileRow[];
  emptyPlans: string;
  /** Advisors: spreadsheets that can be read again (e.g. after a fix to how a format is read). */
  reread?: { ids: string[]; action: (documentId: string) => Promise<void> };
}) {
  const canReread = (f: FileRow) => !!reread?.ids.includes(f.id) && f.status !== "Being read";
  const [view, setView] = useState<View>("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const choose = setView;
  const toggle = (id: string, only = false) =>
    setSelected((s) => {
      if (only) return s.size === 1 && s.has(id) ? new Set() : new Set([id]);
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const picked = files.filter((f) => selected.has(f.id));
  const open = (f: FileRow) => {
    if (f.previewHref) window.open(f.previewHref, "_blank", "noopener");
    else downloadAll([f]);
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="docs-plans" className="space-y-3">
        <div>
          <h2 id="docs-plans" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Action plans</h2>
          <p className="text-sm" style={muted}>Every plan built for the company, newest first.</p>
        </div>
        {plans.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm" style={{ ...card, ...muted }}>{emptyPlans}</p>
        ) : (
          <ul aria-label="Action plans" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 24rem), 1fr))" }}>
            {plans.map((p) => (
              <li key={p.id} className="rounded-xl border px-4 py-3 flex items-center gap-3" style={card}>
                <ClipboardList size={20} aria-hidden style={{ color: "var(--green)" }} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <a href={p.href} className="font-medium link block line-clamp-2" title={p.title}>{p.title}</a>
                  <div className="text-xs truncate" style={muted}>{p.tier} · {p.status} · {p.date}</div>
                </div>
                <a href={p.href} className="btn btn-secondary text-sm shrink-0">Open plan</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="docs-files" className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 id="docs-files" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Data and input materials</h2>
            <p className="text-sm" style={muted}>Every file shared, newest first. Click to select, double-click to open.</p>
          </div>
          {files.length > 0 && (
            <div role="group" aria-label="View" className="inline-flex rounded-full border overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {([["grid", LayoutGrid, "Grid view"], ["list", List, "List view"]] as const).map(([v, Icon, label]) => (
                <button key={v} type="button" aria-pressed={view === v} aria-label={label} title={label} onClick={() => choose(v)} className="px-3 py-1.5 inline-flex items-center gap-1" style={view === v ? { background: "var(--green-muted)", color: "var(--foreground)" } : muted}>
                  {view === v && <Check size={14} aria-hidden />}
                  <Icon size={16} aria-hidden />
                </button>
              ))}
            </div>
          )}
        </div>

        {picked.length > 0 && (
          <div role="toolbar" aria-label="Selected files" className="rounded-full border px-3 py-1.5 flex items-center gap-2 flex-wrap text-sm sticky top-2 z-10" style={{ ...card, boxShadow: "0 1px 3px rgba(0,0,0,.12)" }}>
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" className="p-1 rounded-full" style={muted}><X size={16} aria-hidden /></button>
            <span className="font-medium" style={{ color: "var(--foreground)" }}>{picked.length} selected</span>
            <span className="flex-1" />
            {picked.length === 1 && picked[0]!.previewHref && (
              <a href={picked[0]!.previewHref} target="_blank" rel="noopener" className="btn btn-secondary text-sm inline-flex items-center gap-1.5"><ExternalLink size={15} aria-hidden /> Open</a>
            )}
            {reread && picked.some(canReread) && (
              <button type="button" onClick={() => picked.filter(canReread).forEach((f) => void reread.action(f.id))} className="btn btn-secondary text-sm inline-flex items-center gap-1.5">
                <RefreshCw size={15} aria-hidden /> Re-read{picked.filter(canReread).length > 1 ? ` ${picked.filter(canReread).length}` : ""}
              </button>
            )}
            <button type="button" onClick={() => downloadAll(picked)} className="btn btn-secondary text-sm inline-flex items-center gap-1.5"><Download size={15} aria-hidden /> Download{picked.length > 1 ? ` ${picked.length}` : ""}</button>
          </div>
        )}

        {files.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm" style={{ ...card, ...muted }}>No files yet. Drop one into any conversation and it will be kept here.</p>
        ) : view === "grid" ? (
          <ul aria-label="Data and input materials" className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 13rem), 1fr))" }}>
            {files.map((f) => {
              const on = selected.has(f.id);
              const { color } = typeOf(f.kind);
              return (
                <li
                  key={f.id}
                  aria-label={f.filename}
                  data-selected={on || undefined}
                  onClick={(e) => (e.target as HTMLElement).closest("a,button,input") || toggle(f.id, !(e.metaKey || e.ctrlKey || e.shiftKey))}
                  onDoubleClick={(e) => (e.target as HTMLElement).closest("a,button,input") || open(f)}
                  className="group rounded-xl border overflow-hidden cursor-pointer select-none flex flex-col"
                  style={{ ...card, ...(on ? { borderColor: "var(--blue)", background: "var(--blue-muted)", boxShadow: "0 0 0 1px var(--blue)" } : {}) }}
                >
                  <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
                    <input type="checkbox" checked={on} onChange={() => toggle(f.id)} aria-label={`Select ${f.filename}`} className={`shrink-0 ${on ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`} />
                    <TypeIcon kind={f.kind} size={16} />
                    <span className="text-sm font-medium truncate flex-1" title={f.filename} style={{ color: on ? "var(--blue)" : "var(--foreground)" }}>{f.filename}</span>
                  </div>
                  <div className="mx-2 rounded-lg flex items-center justify-center h-28" style={{ background: `${color}14` }}>
                    <TypeIcon kind={f.kind} size={44} />
                  </div>
                  <div className="px-3 py-2.5 text-xs space-y-1" style={muted}>
                    <div>{f.kind} · {f.size} · {f.date}</div>
                    <div className="truncate">{f.source.href ? <a href={f.source.href} className="link">{f.source.label}</a> : f.source.label}</div>
                    <div className="flex items-center gap-2">
                      <span className="flex-1" style={f.failed ? { color: "var(--amber)" } : undefined}>{f.status}</span>
                      {f.sourceUrl && <a href={f.sourceUrl} target="_blank" rel="noopener" className="link">Original link</a>}
                      {reread && canReread(f) && <button type="button" onClick={() => void reread.action(f.id)} className="link" aria-label={`Re-read ${f.filename}`}>Re-read</button>}
                      <a href={f.downloadHref} className="link inline-flex items-center gap-1" aria-label={`Download ${f.filename}`} title="Download"><Download size={14} aria-hidden /></a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-xl border overflow-x-auto" style={card}>
            <table aria-label="Data and input materials" className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ ...muted, borderColor: "var(--border)" }}>
                  <th className="py-2 pl-3 w-8"><span className="sr-only">Select</span></th>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium hidden md:table-cell">Shared in</th>
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">Added</th>
                  <th className="py-2 pr-3 font-medium hidden sm:table-cell">Size</th>
                  <th className="py-2 pr-3 font-medium hidden sm:table-cell">Status</th>
                  <th className="py-2 pr-3"><span className="sr-only">Download</span></th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const on = selected.has(f.id);
                  return (
                    <tr
                      key={f.id}
                      data-selected={on || undefined}
                      onClick={(e) => (e.target as HTMLElement).closest("a,button,input") || toggle(f.id, !(e.metaKey || e.ctrlKey || e.shiftKey))}
                      onDoubleClick={(e) => (e.target as HTMLElement).closest("a,button,input") || open(f)}
                      className="border-b last:border-b-0 cursor-pointer select-none"
                      style={{ borderColor: "var(--border)", ...(on ? { background: "var(--blue-muted)" } : {}) }}
                    >
                      <td className="py-2 pl-3"><input type="checkbox" checked={on} onChange={() => toggle(f.id)} aria-label={`Select ${f.filename}`} /></td>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2 min-w-0">
                          <TypeIcon kind={f.kind} size={18} />
                          <span className="font-medium truncate" title={f.filename} style={{ color: on ? "var(--blue)" : "var(--foreground)" }}>{f.filename}</span>
                        </span>
                      </td>
                      <td className="py-2 pr-3 hidden md:table-cell truncate max-w-[16rem]" style={muted}>{f.source.href ? <a href={f.source.href} className="link">{f.source.label}</a> : f.source.label}</td>
                      <td className="py-2 pr-3 whitespace-nowrap" style={muted}>{f.date}</td>
                      <td className="py-2 pr-3 whitespace-nowrap hidden sm:table-cell" style={muted}>{f.size}</td>
                      <td className="py-2 pr-3 whitespace-nowrap hidden sm:table-cell" style={f.failed ? { color: "var(--amber)" } : muted}>{f.status}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {f.sourceUrl && <a href={f.sourceUrl} target="_blank" rel="noopener" className="link mr-3">Original link</a>}
                        {reread && canReread(f) && <button type="button" onClick={() => void reread.action(f.id)} className="link mr-3" aria-label={`Re-read ${f.filename}`}>Re-read</button>}
                        <a href={f.downloadHref} className="link inline-flex" aria-label={`Download ${f.filename}`} title="Download"><Download size={16} aria-hidden /></a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
