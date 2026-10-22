import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";

export default async function DashboardPage() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title={`Welcome${user.name ? `, ${user.name}` : ""}`}
        subtitle="Here's where your growth engine stands today."
      />
      <div
        className="rounded-xl border p-6 text-sm"
        style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      >
        {company
          ? `Your Growth Intelligence profile for ${company.name} will appear here.`
          : "Your Growth Intelligence profile will appear here once your company is set up."}
      </div>
    </div>
  );
}
