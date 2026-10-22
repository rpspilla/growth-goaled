import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { listManagedCompanies } from "@/lib/data/companies";
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

export default async function PortfolioPage() {
  const user = await requireRole(["advisor", "admin"]);
  const [companies, invites] = await Promise.all([listManagedCompanies(user), listOpenInvites(user)]);
  const card = { background: "var(--card)", borderColor: "var(--border)" };

  return (
    <div className="p-8 max-w-6xl space-y-6">
      <PageHeader
        title="Portfolio Overview"
        subtitle={user.role === "admin" ? "Every company on Growth Goaled." : "Companies assigned to you."}
      />

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 rounded-xl border overflow-hidden" style={card}>
          <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}>
            Companies ({companies.length})
          </div>
          {companies.length === 0 && (
            <div className="px-5 py-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
              No companies yet. Invite a founder or claim one from the Unassigned queue.
            </div>
          )}
          {companies.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>
                {c.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                {c.name}
                {c.isSample && <span className="ml-2 text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>(sample)</span>}
              </div>
              <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}>
                {PHASE_LABEL[c.phase]}
              </span>
            </div>
          ))}
          <div className="px-5 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Counts, health and the full portfolio table arrive in milestone M9.
          </div>
        </div>

        <div className="col-span-2 space-y-6">
          <div className="rounded-xl border p-5" style={card}>
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>Invite a founder</div>
            <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
              Creates the company in your portfolio and sends the founder a single-use sign-up link.
            </p>
            <InviteFounderForm />
          </div>

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
