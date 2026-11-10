import { Download, FileText, ClipboardList } from "lucide-react";

export type PlanRow = { id: string; title: string; tier: string; status: string; date: string; href: string };
export type FileRow = { id: string; filename: string; kind: string; size: string; date: string; status: string; failed: boolean; source: { label: string; href: string | null }; downloadHref: string; sourceUrl: string | null };

const card = { background: "var(--card)", borderColor: "var(--border)" };
const muted = { color: "var(--muted-foreground)" };

/** A company's documents: (i) action plans on top, (ii) the data and input materials shared, below. */
export function DocumentLibrary({ plans, files, emptyPlans }: { plans: PlanRow[]; files: FileRow[]; emptyPlans: string }) {
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
          <ul aria-label="Action plans" className="rounded-xl border divide-y" style={card}>
            {plans.map((p) => (
              <li key={p.id} className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--border)" }}>
                <ClipboardList size={18} aria-hidden style={{ color: "var(--green)" }} className="shrink-0" />
                <div className="flex-1 min-w-[12rem]">
                  <a href={p.href} className="font-medium link">{p.title}</a>
                  <div className="text-xs" style={muted}>{p.tier} · {p.status} · {p.date}</div>
                </div>
                <a href={p.href} className="btn btn-secondary text-sm">Open plan</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="docs-files" className="space-y-3">
        <div>
          <h2 id="docs-files" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Data and input materials</h2>
          <p className="text-sm" style={muted}>Every file shared in a conversation or on the data step, kept here to come back to.</p>
        </div>
        {files.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm" style={{ ...card, ...muted }}>No files yet. Drop one into any conversation and it will be kept here.</p>
        ) : (
          <ul aria-label="Data and input materials" className="rounded-xl border divide-y" style={card}>
            {files.map((f) => (
              <li key={f.id} className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--border)" }}>
                <FileText size={18} aria-hidden style={muted} className="shrink-0" />
                <div className="flex-1 min-w-[12rem]">
                  <div className="font-medium break-all" style={{ color: "var(--foreground)" }}>{f.filename}</div>
                  <div className="text-xs flex gap-1.5 flex-wrap" style={muted}>
                    <span>{f.kind} · {f.size} · {f.date}</span>
                    <span>·</span>
                    {f.source.href ? <a href={f.source.href} className="link">{f.source.label}</a> : <span>{f.source.label}</span>}
                    <span>·</span>
                    <span style={f.failed ? { color: "var(--amber)" } : undefined}>{f.status}</span>
                  </div>
                </div>
                {f.sourceUrl && <a href={f.sourceUrl} target="_blank" rel="noopener" className="text-sm link">Original link</a>}
                <a href={f.downloadHref} className="btn btn-secondary text-sm inline-flex items-center gap-1.5" aria-label={`Download ${f.filename}`}>
                  <Download size={15} aria-hidden /> Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
