import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { assessmentCompletions } from "@/lib/data/assessments";
import { founderContext } from "@/lib/data/founder-context";
import { listPayments } from "@/lib/data/payments";
import { getUseCase, isUseCaseId } from "@/lib/use-cases";
import { assessmentHistory } from "@/lib/use-cases/history";

const date = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

/** Every assessment the founder's company has started or bought. Only their own company's records. */
export default async function AssessmentsPage() {
  const { company, useCases } = await founderContext();
  if (!company) return <div className="p-8"><PageHeader title="Your assessments" subtitle="Your company isn't set up yet." /></div>;
  const [payments, completed] = await Promise.all([listPayments(company.id), assessmentCompletions(company.id)]);
  const entries = assessmentHistory(useCases, payments, completed, [], isUseCaseId);

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <PageHeader title="Your assessments" subtitle="Every question you've started, what you've bought, and where each one stands." />
      {entries.length === 0 ? (
        <div className="rounded-xl border p-6 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          No assessments yet. <Link href="/library" style={{ color: "var(--green)" }}>Pick a question in the library</Link> to get a free Snapshot.
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--muted-foreground)", background: "var(--muted)" }}>
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
                    <Link href={e.href} className="font-semibold" style={{ color: "var(--green)" }}>{e.purchase === "Purchased" || e.purchase === "Granted by your advisor" ? "Open" : "Snapshot"} →</Link>
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
