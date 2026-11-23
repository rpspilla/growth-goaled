import Link from "next/link";
import { ActionForm } from "@/components/advisor/ActionForm";
import { IntelligenceFields } from "@/components/advisor/IntelligenceFields";
import { requireRole } from "@/lib/auth/session";
import { EVIDENCE_LEVELS, INTELLIGENCE_STATUSES, INTELLIGENCE_TYPES } from "@/lib/cro";
import { croForUser, listCroProfiles, listIntelligence } from "@/lib/data/cro";
import type { CroIntelligence } from "@/lib/db/schema";
import { createRecordAction } from "../cros/actions";
import { db, schema } from "@/lib/db";

export const metadata = { title: "CRO intelligence library" };

const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };
const STATUS_TONE: Record<CroIntelligence["status"], { background: string; color: string }> = {
  draft: { background: "var(--muted)", color: "var(--muted-foreground)" },
  submitted: { background: "var(--amber-muted)", color: "var(--amber)" },
  validated: { background: "var(--green-muted)", color: "var(--green)" },
  rejected: { background: "var(--red-muted)", color: "var(--red)" },
  retired: { background: "var(--muted)", color: "var(--muted-foreground)" },
};

/**
 * The CRO Intelligence Library (Nov 23, 2026): every CRO's principles, frameworks, scenarios, cases,
 * lessons and perspectives, each attributed, with who endorses or disputes it. Only validated records
 * reach founders' conversations.
 */
export default async function IntelligencePage({ searchParams }: { searchParams: Promise<{ type?: string; cro?: string; status?: string }> }) {
  const user = await requireRole(["advisor", "admin"]);
  const f = await searchParams;
  const status = f.status && f.status in INTELLIGENCE_STATUSES ? (f.status as CroIntelligence["status"]) : undefined;
  const [records, cros, mine, all, conflictRows] = await Promise.all([
    listIntelligence({ type: f.type, croId: f.cro, status }),
    listCroProfiles(),
    croForUser(user.id),
    listIntelligence(),
    db.select({ recordId: schema.croIntelligenceConflicts.recordId, otherId: schema.croIntelligenceConflicts.otherId, status: schema.croIntelligenceConflicts.status }).from(schema.croIntelligenceConflicts),
  ]);
  const conflictCount = (id: string, st: "suggested" | "confirmed") => conflictRows.filter((c) => c.status === st && (c.recordId === id || c.otherId === id)).length;
  const canWrite = user.role === "admin" || Boolean(mine);

  return (
    <div className="page space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl" style={fg}>CRO intelligence library</h1>
          <p className="text-sm mt-1 max-w-3xl" style={muted}>
            Each record belongs to a CRO (or is a network position), with its evidence, and who endorses or disputes it. Records reach founders&apos; conversations only once validated by another CRO or an admin.
          </p>
        </div>
        <div className="flex gap-4 flex-wrap">
          <Link href="/advisor/intelligence/import" className="btn btn-secondary text-sm">Import a training workbook</Link>
          <Link href="/advisor/cros" className="link text-sm">CRO network →</Link>
        </div>
      </header>

      <form className="flex gap-2 flex-wrap items-end" aria-label="Filter records">
        <select name="type" defaultValue={f.type ?? ""} className="field" aria-label="Type">
          <option value="">All types</option>
          {Object.entries(INTELLIGENCE_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select name="cro" defaultValue={f.cro ?? ""} className="field" aria-label="CRO">
          <option value="">All CROs</option>
          {cros.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} className="field" aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(INTELLIGENCE_STATUSES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary text-sm">Filter</button>
      </form>

      {records.length ? (
        <ul aria-label="Intelligence records" className="surface divide-y" style={{ borderColor: "var(--border)" }}>
          {records.map((r) => {
            const endorse = r.stances.filter((s) => s.stance === "endorses").length;
            const dispute = r.stances.filter((s) => s.stance === "disputes").length;
            return (
              <li key={r.id} className="p-4 flex gap-3 items-start flex-wrap" style={{ borderColor: "var(--border)" }}>
                <div className="flex-1 min-w-[16rem]">
                  <Link href={`/advisor/intelligence/${r.id}`} className="text-base font-semibold hover:underline" style={fg}>{r.title}</Link>
                  <div className="text-sm mt-0.5" style={muted}>
                    {r.fromCommitmentId ? "From a founder outcome · " : ""}{INTELLIGENCE_TYPES[r.type]} · {r.primaryCroName ?? "Network position"}
                    {r.stances.some((s) => s.stance === "co_author") ? ` with ${r.stances.filter((s) => s.stance === "co_author").map((s) => s.croName).join(", ")}` : ""} · {EVIDENCE_LEVELS[r.evidence]} · v{r.version}
                  </div>
                  {(endorse > 0 || dispute > 0) && (
                    <div className="text-xs mt-1" style={muted}>
                      {endorse > 0 && `${endorse} endorse${endorse === 1 ? "s" : ""}`}
                      {endorse > 0 && dispute > 0 && " · "}
                      {dispute > 0 && <span style={{ color: "var(--amber)" }}>{dispute} see{dispute === 1 ? "s" : ""} it differently</span>}
                    </div>
                  )}
                </div>
                {conflictCount(r.id, "suggested") > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--blue-muted)", color: "var(--blue)" }}>Possible conflict</span>}
                {conflictCount(r.id, "confirmed") > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--amber-muted)", color: "var(--amber)" }}>CROs differ</span>}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={STATUS_TONE[r.status]}>{INTELLIGENCE_STATUSES[r.status]}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="surface p-5 text-base" style={muted}>No records{f.type || f.cro || status ? " match these filters" : " yet"}.</p>
      )}

      {canWrite ? (
        <section className="surface p-5 space-y-3">
          <h2 className="text-lg font-semibold" style={fg}>New record</h2>
          <p className="text-sm" style={muted}>Saved as a draft. Submit it for review from its page.</p>
          <ActionForm action={createRecordAction} submit="Save draft" label="New intelligence record" className="space-y-4">
            <IntelligenceFields record={{}} cros={cros} others={all.map((r) => ({ id: r.id, title: r.title }))} lockedCroId={user.role === "admin" ? null : (mine?.id ?? null)} canCollective={user.role === "admin"} />
          </ActionForm>
        </section>
      ) : (
        <p className="text-sm" style={muted}>To contribute, an admin links your login to your CRO profile.</p>
      )}
    </div>
  );
}
