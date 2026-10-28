import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { assessmentCompletions } from "@/lib/data/assessments";
import { founderContext } from "@/lib/data/founder-context";
import { listPayments } from "@/lib/data/payments";
import { getUseCase, isUseCaseId } from "@/lib/use-cases";
import { assessmentHistory } from "@/lib/use-cases/history";

const date = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

/** Every assessment the founder's company has started or bought. Only their own company's records. */
export default async function AssessmentsPage() {
  const { company, useCases } = await founderContext();
  if (!company) return <div className="px-4 sm:px-8 py-8"><PageHeader title="Your assessments" subtitle="Your company isn't set up yet." /></div>;
  const [payments, completed] = await Promise.all([listPayments(company.id), assessmentCompletions(company.id)]);
  const entries = assessmentHistory(useCases, payments, completed, [], isUseCaseId);

  return (
    <div className="px-4 sm:px-8 py-8 max-w-5xl">
      <PageHeader title="Your assessments" subtitle="Every question you've started, what you've bought, and where each one stands." />
      {entries.length === 0 ? (
        <EmptyState
          title="No assessments yet"
          body="Pick the growth question you most need answered. Your Snapshot is free; you only pay if you want the full assessment."
          action={<Link href="/library" className="btn btn-primary">Pick a growth question →</Link>}
        />
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full text-base min-w-[640px]">
            <thead>
              <tr className="text-left text-sm" style={{ color: "var(--muted-foreground)", background: "var(--muted)" }}>
                {["Assessment", "Purchase", "Status", "Started", "Completed", ""].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.useCase} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-3 font-medium" style={{ color: "var(--foreground)" }}>{getUseCase(e.useCase)!.question}</td>
                  <td className="px-4 py-3" style={{ color: e.purchase === "Purchased" || e.purchase === "Granted by your advisor" ? "var(--green)" : "var(--muted-foreground)" }}>{e.purchase}</td>
                  <td className="px-4 py-3" style={{ color: "var(--foreground)" }}>{e.assessment}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted-foreground)" }}>{date(e.createdAt)}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted-foreground)" }}>{date(e.completedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={e.href} className="link">{e.purchase === "Purchased" || e.purchase === "Granted by your advisor" ? "Open" : "Snapshot"} →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
