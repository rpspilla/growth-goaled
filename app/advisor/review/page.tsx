import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { GenerateButton } from "@/components/deliverables/GenerateButton";
import { STATUS_LABEL } from "@/components/deliverables/status";
import { requireRole } from "@/lib/auth/session";
import { listManagedCompanies } from "@/lib/data/companies";
import { listQueue, type QueueItem } from "@/lib/data/deliverables";
import { salesCallsToCollect } from "@/lib/data/assessments";
import { getUseCase } from "@/lib/use-cases";
import { generateBenchmark } from "./actions";
import { plansAwaitingApproval } from "@/lib/data/plan";
import { plansForReview } from "@/lib/data/action-plans";

// Drafting runs after the action responds (next/server after()), within this budget.
export const maxDuration = 300;

const ORDER = ["in_review", "approved", "failed", "stalled", "qa", "drafting"];
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Row({ item }: { item: QueueItem }) {
  const s = STATUS_LABEL[item.status] ?? { label: item.status, color: "var(--muted-foreground)" };
  return (
    <Link href={`/advisor/review/${item.id}`} className="flex items-center gap-4 px-5 py-4 border-b hover:opacity-80" style={{ borderColor: "var(--border)" }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{item.companyName}</div>
        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Benchmark · v{item.version}
          {item.preliminary && <span style={{ color: "var(--amber)" }}> · preliminary</span>} · updated {when(item.updatedAt)}
        </div>
      </div>
      <span className="text-xs font-semibold" style={{ color: s.color }}>{s.label}</span>
    </Link>
  );
}

export default async function ReviewQueuePage() {
  const user = await requireRole(["advisor", "admin"]);
  const companies = await listManagedCompanies(user);
  const [items, calls, growthPlans, boardPlans] = await Promise.all([listQueue(companies.map((c) => c.id)), salesCallsToCollect(companies.map((c) => c.id)), plansAwaitingApproval(companies.map((c) => c.id)), plansForReview(user)]);
  // Latest version per company decides what needs attention.
  const latest = new Map<string, QueueItem>();
  for (const i of items) if (!latest.has(i.companyId) || latest.get(i.companyId)!.version < i.version) latest.set(i.companyId, i);
  const open = [...latest.values()].filter((i) => ORDER.includes(i.status)).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const busy = new Set(open.filter((i) => ["in_review", "approved", "qa", "drafting"].includes(i.status)).map((i) => i.companyId));
  const history = items.filter((i) => !open.includes(i));

  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl">
      <PageHeader title="Review Queue" subtitle="AI-generated deliverables and action plans awaiting advisor review before release to founders." />
      {/* No action plan goes live until an advisor reviews it (Nov 12, 2026). */}
      <section className="surface mb-6 overflow-hidden" aria-labelledby="plans-waiting">
        <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 id="plans-waiting" className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
            Action plans waiting for approval ({growthPlans.length + boardPlans.length})
          </h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>The founder sees &ldquo;Your advisor is reviewing your plan&rdquo; until you approve.</p>
        </div>
        {growthPlans.map((p) => (
          <Link key={p.deliverableId} href={`/advisor/companies/${p.companyId}/progress`} className="flex items-center gap-4 px-5 py-4 border-b hover:opacity-80" style={{ borderColor: "var(--border)" }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{p.companyName}</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Growth project plan · {getUseCase(p.useCase ?? "")?.shortTitle ?? p.useCase} · v{p.version}</div>
            </div>
            <span className="text-xs font-semibold" style={{ color: "var(--amber)" }}>Review and approve →</span>
          </Link>
        ))}
        {boardPlans.map((p) => (
          <Link key={p.plan.id} href={`/advisor/plans/${p.plan.id}`} className="flex items-center gap-4 px-5 py-4 border-b hover:opacity-80" style={{ borderColor: "var(--border)" }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{p.company}</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Action plan · {p.title}{p.due ? ` · due ${when(p.due.toISOString())}` : ""}</div>
            </div>
            <span className="text-xs font-semibold" style={{ color: p.overdue ? "var(--red)" : "var(--amber)" }}>{p.plan.status === "drafting" ? "Being drafted" : "Review and approve →"}</span>
          </Link>
        ))}
        {growthPlans.length + boardPlans.length === 0 && <p className="px-5 py-4 text-sm" style={{ color: "var(--muted-foreground)" }}>Nothing waiting.</p>}
      </section>
      {calls.length > 0 && (
        <section className="surface mb-6 overflow-hidden" aria-labelledby="calls" style={{ borderColor: "var(--amber)" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--amber-muted)" }}>
            <h2 id="calls" className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
              Sales calls to collect ({calls.length})
            </h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              These founders&apos; reports published without the recorded sales calls their question expects. Ask them for recordings or transcripts, then re-run the report so the sales call review is complete.
            </p>
          </div>
          {calls.map((c) => (
            <Link key={c.companyId} href={`/advisor/companies/${c.companyId}/data#item-sales_calls`} className="flex items-center gap-4 px-5 py-4 border-b hover:opacity-80" style={{ borderColor: "var(--border)" }}>
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
                  {c.companyName}
                </div>
                <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {getUseCase(c.useCase)?.question ?? "Growth project"}
                </div>
              </div>
              <span className="text-sm font-semibold font-mono" style={{ color: "#92400E" }}>
                {c.count} of {c.expected} calls
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--amber)" }}>
                Collect →
              </span>
            </Link>
          ))}
        </section>
      )}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>Needs attention · {open.length}</h2>
            <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              {open.length === 0 && <div className="p-5 text-sm" style={{ color: "var(--muted-foreground)" }}>Nothing waiting for review.</div>}
              {open.map((i) => <Row key={i.id} item={i} />)}
            </div>
          </section>
          {history.length > 0 && (
            <details>
              <summary className="text-sm cursor-pointer" style={{ color: "var(--muted-foreground)" }}>History · {history.length}</summary>
              <div className="rounded-xl border overflow-hidden mt-2" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                {history.map((i) => <Row key={i.id} item={i} />)}
              </div>
            </details>
          )}
        </div>
        <div>
          <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>Generate a Benchmark</div>
            <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
              Uses the company&apos;s accepted figures and the best-matching cohort&apos;s approved benchmark rows. Founders also start this when they send their data.
            </p>
            {companies.length === 0 && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>You don&apos;t manage any companies yet.</p>}
            <div className="space-y-3">
              {companies.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm truncate" style={{ color: "var(--foreground)" }}>{c.name}</div>
                    <div className="text-xs capitalize" style={{ color: "var(--muted-foreground)" }}>{c.phase}</div>
                  </div>
                  {busy.has(c.id) ? (
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>In progress</span>
                  ) : (
                    <GenerateButton companyId={c.id} label={latest.has(c.id) ? "Regenerate" : "Generate"} generate={generateBenchmark} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
