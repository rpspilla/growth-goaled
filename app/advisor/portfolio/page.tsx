import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import Link from "next/link";
import { listManagedCompanies } from "@/lib/data/companies";
import { portfolioCounts, portfolioRows } from "@/lib/data/portfolio";
import { STATUS_LABEL } from "@/components/deliverables/status";
import { formatMetric } from "@/lib/metrics";
import { listOpenInvites } from "@/lib/data/invites";
import { revokeInviteAction } from "./actions";
import { InviteFounderForm, ResendInviteButton } from "./InviteForms";

const PHASE_LABEL: Record<string, string> = {
  intake: "Intake",
  upload: "Upload",
  benchmark: "Benchmark",
  baseline: "Baseline",
  icp: "ICP",
  channels: "Channel Strategy",
  hiring: "Hiring Plan",
  complete: "Complete",
};
const date = (d: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(d);

const HEALTH: Record<string, { bg: string; color: string; label: string }> = {
  good: { bg: "var(--green-muted)", color: "var(--green)", label: "On track" },
  watch: { bg: "var(--amber-muted)", color: "var(--amber)", label: "Watch" },
  critical: { bg: "var(--red-muted)", color: "var(--red)", label: "At risk" },
};

export default async function PortfolioPage() {
  const user = await requireRole(["advisor", "admin"]);
  const [companies, invites] = await Promise.all([listManagedCompanies(user), listOpenInvites(user)]);
  const rows = await portfolioRows(companies);
  const counts = portfolioCounts(rows);
  const card = { background: "var(--card)", borderColor: "var(--border)" };
  rows.sort((a, b) => b.attention.length - a.attention.length || a.name.localeCompare(b.name));

  return (
    <div className="p-8 max-w-7xl space-y-6">
      <PageHeader
        title="Portfolio Overview"
        subtitle={user.role === "admin" ? "Every company on Growth Goaled." : "Companies assigned to you."}
      />

      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Active companies", value: counts.active, color: "var(--foreground)" },
          { label: "Require attention", value: counts.attention, color: "var(--red)" },
          { label: "Awaiting founder input", value: counts.awaitingFounder, color: "var(--amber)" },
          { label: "In advisor review", value: counts.inReview, color: "var(--blue)" },
          { label: "Complete", value: counts.complete, color: "var(--green)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border p-4" style={card}>
            <div className="font-mono text-2xl font-semibold mb-1" style={{ color }}>{value}</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border overflow-hidden" style={card}>
        <div className="grid grid-cols-12 px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}>
          <div className="col-span-3">Company</div>
          <div className="col-span-1">Stage</div>
          <div className="col-span-1">ARR</div>
          <div className="col-span-1">Growth</div>
          <div className="col-span-1">Health</div>
          <div className="col-span-1">Phase</div>
          <div className="col-span-1">Data</div>
          <div className="col-span-1">Questions</div>
          <div className="col-span-2">Benchmark</div>
        </div>
        {rows.length === 0 && (
          <div className="px-5 py-6 text-sm" style={{ color: "var(--muted-foreground)" }}>No companies yet. Invite a founder or claim one from the Unassigned queue.</div>
        )}
        {rows.map((r) => {
          const h = r.health ? HEALTH[r.health] : null;
          const b = r.benchmarkStatus ? STATUS_LABEL[r.benchmarkStatus] : null;
          return (
            <Link key={r.id} href={`/advisor/companies/${r.id}`} className="grid grid-cols-12 items-center px-5 py-4 border-b hover:opacity-80" style={{ borderColor: "var(--border)" }}>
              <div className="col-span-3 flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>{r.name[0]?.toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                    {r.name}
                    {r.isSample && <span className="ml-1 text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>(sample)</span>}
                  </div>
                  <div className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.score != null ? `GIS ${Math.round(r.score)}` : "No score"}</div>
                </div>
                {r.attention.length > 0 && <div className="w-2 h-2 rounded-full shrink-0" title={r.attention.join(", ")} style={{ background: "var(--red)" }} />}
              </div>
              <div className="col-span-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.stage ?? "—"}</div>
              <div className="col-span-1 font-mono text-sm font-semibold" style={{ color: "var(--foreground)" }}>{r.arr != null ? formatMetric("arr", r.arr) : "—"}</div>
              <div className="col-span-1 font-mono text-sm" style={{ color: r.growth != null ? "var(--green)" : "var(--muted-foreground)" }}>{r.growth != null ? `↑ ${formatMetric("arr_growth", r.growth)}` : "—"}</div>
              <div className="col-span-1">{h ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: h.bg, color: h.color }}>{h.label}</span> : <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>}</div>
              <div className="col-span-1"><span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}>{PHASE_LABEL[r.phase]}</span></div>
              <div className="col-span-1 font-mono text-xs" style={{ color: "var(--foreground)" }}>{r.readinessPercent}%</div>
              <div className="col-span-1 font-mono text-xs" style={{ color: r.openQuestions ? "var(--amber)" : "var(--muted-foreground)" }}>{r.openQuestions}</div>
              <div className="col-span-2 text-xs font-medium" style={{ color: b?.color ?? "var(--muted-foreground)" }}>{b?.label ?? "Not started"}</div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-2 rounded-xl border p-5" style={card}>
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>Invite a founder</div>
            <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
              Creates the company in your portfolio and sends the founder a single-use sign-up link.
            </p>
            <InviteFounderForm />
        </div>
        <div className="col-span-3">
          <div className="rounded-xl border overflow-hidden" style={card}>
            <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}>
              Open invites ({invites.length})
            </div>
            {invites.length === 0 && (
              <div className="px-5 py-4 text-sm" style={{ color: "var(--muted-foreground)" }}>No open invites.</div>
            )}
            {invites.map((i) => (
              <div key={i.id} className="px-5 py-3 border-b space-y-2" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>{i.companyName}</div>
                    <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{i.email}</div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                    style={i.status === "valid" ? { background: "var(--amber-muted)", color: "var(--amber)" } : { background: "var(--red-muted)", color: "var(--red)" }}
                  >
                    {i.status === "valid" ? `Expires ${date(i.expiresAt)}` : "Expired"}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <ResendInviteButton inviteId={i.id} />
                  </div>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="inviteId" value={i.id} />
                    <button type="submit" className="text-xs font-medium px-3 py-1.5 rounded-md" style={{ color: "var(--red)" }}>
                      Revoke
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
