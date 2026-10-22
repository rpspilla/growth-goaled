import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DashboardView } from "@/components/views/DashboardView";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { getDashboard } from "@/lib/data/dashboard";
import { getIntakeAnswers } from "@/lib/data/intake";
import { percentComplete } from "@/lib/intake";

export default async function DashboardPage() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) {
    return (
      <div className="p-8 max-w-4xl">
        <PageHeader title="Welcome" subtitle="Your company isn't set up yet. Contact your advisor if this persists." />
      </div>
    );
  }

  const [data, answers] = await Promise.all([getDashboard(company), company.phase === "intake" ? getIntakeAnswers(company) : null]);
  const percent = answers ? percentComplete(answers) : null;

  return (
    <>
      {percent !== null && (
        <div className="px-8 pt-8 max-w-6xl">
          <Link
            href="/intake"
            className="flex items-center gap-4 rounded-xl border p-4 transition-all hover:shadow-sm"
            style={{ background: "var(--card)", borderColor: "var(--green)" }}
          >
            <div className="flex-1">
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>Finish your company profile</div>
              <div className="h-1.5 rounded-full" style={{ background: "var(--muted)" }}>
                <div className="h-1.5 rounded-full" style={{ width: `${percent}%`, background: "var(--green)" }} />
              </div>
            </div>
            <span className="font-mono text-sm font-semibold" style={{ color: "var(--green)" }}>{percent}%</span>
            <span className="text-sm font-semibold" style={{ color: "var(--green)" }}>Continue →</span>
          </Link>
        </div>
      )}
      <DashboardView data={data} hrefFor={(path) => path} />
    </>
  );
}
