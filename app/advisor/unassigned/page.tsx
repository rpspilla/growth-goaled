import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { listStaff, listUnassignedCompanies } from "@/lib/data/companies";
import { REVENUE_BANDS } from "@/lib/onboarding";
import { claimCompany } from "./actions";

const bandLabel = (v: string | null) => REVENUE_BANDS.find((b) => b.value === v)?.label ?? "—";
const date = (d: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(d);

export default async function UnassignedPage() {
  const user = await requireRole(["advisor", "admin"]);
  const [companies, staff] = await Promise.all([listUnassignedCompanies(), user.role === "admin" ? listStaff() : []]);

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader title="Unassigned Companies" subtitle="Founders who signed up on their own. Claim a company to add it to your portfolio." />

      {companies.length === 0 ? (
        <div className="rounded-xl border p-6 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          No companies are waiting for an advisor.
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div
            className="grid grid-cols-12 px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider"
            style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}
          >
            <div className="col-span-4">Company</div>
            <div className="col-span-3">Founder</div>
            <div className="col-span-1">Revenue</div>
            <div className="col-span-1">Signed up</div>
            <div className="col-span-3 text-right">Assign</div>
          </div>
          {companies.map((c) => (
            <div key={c.id} className="grid grid-cols-12 items-center px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="col-span-4 flex items-center gap-3 min-w-0">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: "var(--secondary)", color: "var(--foreground)" }}
                >
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>{c.name}</div>
                  {c.website && (
                    <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{c.website.replace(/^https?:\/\//, "")}</div>
                  )}
                </div>
              </div>
              <div className="col-span-3 min-w-0">
                <div className="text-sm truncate" style={{ color: "var(--foreground)" }}>{c.founderName ?? "—"}</div>
                <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{c.founderEmail ?? "No founder yet"}</div>
              </div>
              <div className="col-span-1 font-mono text-xs" style={{ color: "var(--foreground)" }}>{bandLabel(c.revenueBand)}</div>
              <div className="col-span-1 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{date(c.createdAt)}</div>
              <form action={claimCompany} className="col-span-3 flex items-center justify-end gap-2">
                <input type="hidden" name="companyId" value={c.id} />
                {user.role === "admin" && staff.length > 0 && (
                  <select
                    name="advisorId"
                    defaultValue={user.id}
                    className="px-2 py-1.5 rounded-md border text-xs max-w-40"
                    style={{ background: "var(--muted)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  >
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id === user.id ? "Me" : (s.name ?? s.email)}
                      </option>
                    ))}
                  </select>
                )}
                <button type="submit" className="text-xs font-semibold px-3 py-1.5 rounded-md" style={{ background: "var(--green)", color: "#fff" }}>
                  {user.role === "admin" ? "Assign" : "Claim"}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
