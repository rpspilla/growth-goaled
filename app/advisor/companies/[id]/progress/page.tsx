import { companyContext } from "../context";

/** Step 5 mirrored. KPI tracking, plan actions and check-ins arrive with U4. */
export default async function CompanyProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { company, active } = await companyContext((await params).id);
  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Step 5 · Progress &amp; Tracking{active ? ` · ${active.def.shortTitle}` : ""}</div>
        <h1 className="font-display text-3xl font-normal" style={{ color: "var(--foreground)" }}>{company.name}: progress</h1>
      </div>
      <div className="rounded-xl border p-6 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
        Tracking starts once a baseline is approved. KPI status, plan actions and monthly check-ins will appear here, with space for your notes.
      </div>
    </div>
  );
}
