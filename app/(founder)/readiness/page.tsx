import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { HandoffCard } from "@/components/readiness/HandoffCard";
import { InboxDropzone } from "@/components/readiness/InboxDropzone";
import { SortReview } from "@/components/readiness/SortReview";
import { listDocuments } from "@/lib/data/documents";
import { latestPreliminary } from "@/lib/data/preliminary";
import { PreliminaryTrigger } from "@/components/deliverables/PreliminaryTrigger";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { isStalled } from "@/lib/data/deliverables";
import { ReadinessTabs } from "@/components/readiness/ReadinessTabs";
import { SummaryCard } from "@/components/readiness/SummaryCard";
import { gapSummarySchema } from "@/lib/ai/readiness-summary";
import { latestAssessment } from "@/lib/data/readiness";
import { getItem } from "@/lib/readiness";
import type { MetricReadiness, QualityIssue } from "@/lib/readiness-assessment";
import { loadReadiness } from "./load";

export const maxDuration = 300;

const name = (key: string) => getItem(key)?.name ?? key;
const itemHref = (key: string) => `/readiness/${getItem(key)?.category ?? ""}`;

const METRIC_STYLE: Record<MetricReadiness["state"], { label: string; color: string }> = {
  ready: { label: "Can be calculated", color: "var(--green)" },
  limited: { label: "Limited", color: "var(--amber)" },
  blocked: { label: "Can't be calculated yet", color: "var(--red)" },
};

const ISSUE_LABEL: Record<QualityIssue["kind"], string> = {
  limitations: "Known limitation",
  missing_fields: "Missing fields",
  short_history: "Short history",
  outdated: "Out of date",
  no_coverage: "No dates recorded",
  estimated: "Estimate",
};

function Panel({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>{title}</div>
      <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>{caption}</p>
      {children}
    </div>
  );
}

export default async function ReadinessPage() {
  const data = await loadReadiness();
  if (!data) {
    return (
      <div className="p-8 max-w-4xl">
        <PageHeader title="Growth Data Readiness" subtitle="Your company isn't set up yet. Contact your advisor if this persists." />
      </div>
    );
  }
  const { company, readiness, missingByCategory, blobPrefix } = data;
  const a = readiness.assessment;
  const [last, documents, prelim] = await Promise.all([latestAssessment(company), listDocuments(company), latestPreliminary(company.id)]);
  const filesWorking = documents.some((d) => d.status === "uploaded" || d.status === "analyzing" || (d.inbox && (d.sortStatus === "sorting" || d.sortStatus === null)));
  const prelimState = !prelim ? null : prelim.status === "drafting" || prelim.status === "qa" ? (isStalled(prelim) ? null : "building") : prelim.codeChecksPassed && (prelim.status === "in_review" || prelim.status === "approved") ? "ready" : null;
  const inbox = documents.filter((d) => d.inbox || d.suggestions.some((x) => x.status === "suggested"));
  const parsedSummary = last?.summary ? gapSummarySchema.safeParse(last.summary) : null;
  const lastChange = Math.max(0, ...readiness.items.map((i) => i.updatedAt.getTime()), ...readiness.files.map((f) => Date.parse(f.createdAt)));
  const counts = { ready: 0, limited: 0, blocked: 0 };
  for (const m of a.analytical) counts[m.state]++;
  const requiredOpen = [...a.gaps.notReviewed, ...a.gaps.missing].filter((k) => getItem(k)?.required);
  const working = readiness.files.filter((f) => f.status === "uploaded" || f.status === "analyzing").length;
  const failed = readiness.files.filter((f) => f.status === "failed").length;
  const visibleIssues = a.quality.issues.filter((i) => i.kind !== "no_coverage");
  const noDates = a.quality.issues.filter((i) => i.kind === "no_coverage");

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        eyebrow="Step 2 · Data Readiness"
        title="Growth Data Readiness"
        subtitle="Tell us what data you have, where it lives and how complete it is. Imperfect data is fine: we'd rather know what's missing."
      />
      <ReadinessTabs missingByCategory={missingByCategory} />

      <PreliminaryTrigger filesWorking={filesWorking} />
      <BuildingRefresh active={prelimState === "building"} />
      {prelimState && (
        <Link
          href="/benchmark"
          className="flex items-center gap-3 rounded-xl border p-4 mb-6"
          style={{ background: "var(--card)", borderColor: "var(--green)" }}
        >
          <span className="text-xl" aria-hidden>📊</span>
          <span className="flex-1 text-sm" style={{ color: "var(--foreground)" }}>
            {prelimState === "building" ? "Building your preliminary benchmark from what you've shared…" : "Your preliminary benchmark is ready. See how you compare and what's still needed."}
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--green)" }}>{prelimState === "building" ? "Track progress →" : "View benchmark →"}</span>
        </Link>
      )}
      <InboxDropzone blobPrefix={blobPrefix} />
      <SortReview docs={inbox} />

      <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
        These are three separate measures. A high collection score means you&apos;ve shared what we asked for. It doesn&apos;t mean the data
        is good, and it says nothing about how the company is performing.
      </p>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Panel title="1 · Collection completeness" caption="How much of what we asked for you've supplied or marked.">
          <div className="font-mono text-3xl font-semibold" style={{ color: "var(--foreground)" }}>{a.collection.requiredPercent}%</div>
          <div className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
            of required items supplied ({a.collection.requiredSupplied} of {a.collection.requiredTotal}; partial counts half)
          </div>
          <div className="h-1.5 rounded-full mb-3" style={{ background: "var(--muted)" }}>
            <div className="h-1.5 rounded-full" style={{ width: `${a.collection.requiredPercent}%`, background: "var(--green)" }} />
          </div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{a.collection.reviewed} of {a.collection.total} items reviewed (including optional)</div>
        </Panel>
        <Panel title="2 · Data quality" caption="How verified, current and consistent the supplied data is.">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt style={{ color: "var(--muted-foreground)" }}>Validated by advisor</dt>
            <dd className="font-mono text-right" style={{ color: "var(--foreground)" }}>{a.quality.validated} of {a.quality.supplied}</dd>
            <dt style={{ color: "var(--muted-foreground)" }}>Unverified</dt>
            <dd className="font-mono text-right" style={{ color: "var(--foreground)" }}>{a.quality.unverified}</dd>
            <dt style={{ color: "var(--muted-foreground)" }}>Estimates</dt>
            <dd className="font-mono text-right" style={{ color: "var(--foreground)" }}>{a.quality.estimated}</dd>
            <dt style={{ color: "var(--muted-foreground)" }}>Quality concerns</dt>
            <dd className="font-mono text-right" style={{ color: visibleIssues.length ? "var(--amber)" : "var(--foreground)" }}>{visibleIssues.length}</dd>
            <dt style={{ color: "var(--muted-foreground)" }}>Open conflicts</dt>
            <dd className="font-mono text-right" style={{ color: a.quality.openConflicts ? "var(--red)" : "var(--foreground)" }}>{a.quality.openConflicts}</dd>
          </dl>
        </Panel>
        <Panel title="3 · Analytical readiness" caption="Which key growth metrics the data supports today.">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            {(["ready", "limited", "blocked"] as const).map((s) => (
              <div key={s} className="contents">
                <dt style={{ color: METRIC_STYLE[s].color }}>{METRIC_STYLE[s].label}</dt>
                <dd className="font-mono text-right" style={{ color: "var(--foreground)" }}>{counts[s]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>&ldquo;Can be calculated&rdquo; means the inputs exist, not that they&apos;ve been checked.</p>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {a.nextRequest && (
            <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--green)" }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--green)" }}>Most useful next step</div>
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>{name(a.nextRequest.key)}</div>
              <p className="text-sm mb-2" style={{ color: "var(--muted-foreground)" }}>{a.nextRequest.request}</p>
              {a.nextRequest.unblocks.length > 0 && (
                <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>Unlocks: {a.nextRequest.unblocks.join(", ")}</p>
              )}
              <Link href={itemHref(a.nextRequest.key)} className="text-xs font-semibold" style={{ color: "var(--green)" }}>Go to item →</Link>
            </div>
          )}

          <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>By category</h2>
            <div className="rounded-xl border divide-y" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              {a.collection.byCategory.map((c) => (
                <Link key={c.id} href={`/readiness/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:opacity-80" style={{ borderColor: "var(--border)" }}>
                  <span className="text-sm flex-1" style={{ color: "var(--foreground)" }}>{c.letter}. {c.name}</span>
                  <span className="text-xs w-28 text-right" style={{ color: "var(--muted-foreground)" }}>{c.reviewed}/{c.total} reviewed</span>
                  <div className="w-24 h-1.5 rounded-full" style={{ background: "var(--muted)" }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${c.requiredPercent}%`, background: "var(--green)" }} />
                  </div>
                  <span className="font-mono text-xs w-10 text-right" style={{ color: "var(--foreground)" }}>{c.requiredPercent}%</span>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>Growth metrics</h2>
            <div className="rounded-xl border divide-y" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              {a.analytical.map((m) => (
                <div key={m.key} className="px-4 py-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm flex-1" style={{ color: "var(--foreground)" }}>
                      {m.label}
                      {m.benchmarkCritical && <span className="text-xs ml-2" style={{ color: "var(--muted-foreground)" }}>needed for benchmark</span>}
                    </span>
                    <span className="text-xs font-medium" style={{ color: METRIC_STYLE[m.state].color }}>{METRIC_STYLE[m.state].label}</span>
                  </div>
                  {m.message && <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{m.message}</p>}
                  {m.blockedBy.length > 0 && <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Needs: {m.blockedBy.map(name).join(", ")}</p>}
                  {m.limitedBy.length > 0 && <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Would be stronger with: {m.limitedBy.map(name).join(", ")}</p>}
                </div>
              ))}
            </div>
          </section>

          {(visibleIssues.length > 0 || noDates.length > 0) && (
            <section>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>Quality concerns</h2>
              <ul className="rounded-xl border divide-y text-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                {visibleIssues.map((i, n) => (
                  <li key={n} className="px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
                    <Link href={itemHref(i.key)} className="font-medium" style={{ color: "var(--foreground)" }}>{name(i.key)}</Link>
                    <span className="text-xs" style={{ color: "var(--amber)" }}> · {ISSUE_LABEL[i.kind]}</span>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{i.detail}</div>
                  </li>
                ))}
                {noDates.length > 0 && (
                  <li className="px-4 py-2.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                    Coverage dates not recorded for {noDates.map((i) => name(i.key)).join(", ")}. Add them so we can check you have enough history.
                  </li>
                )}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <HandoffCard ready={a.readyForBenchmark} blockers={a.benchmarkBlockers} alreadyMoved={company.phase !== "intake" && company.phase !== "upload"} />
          <SummaryCard
            summary={parsedSummary?.success ? parsedSummary.data : null}
            createdAt={last?.summary ? last.createdAt.toISOString() : null}
            stale={!!last && last.createdAt.getTime() < lastChange}
          />

          <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>Needs your attention</div>
            <ul className="text-sm space-y-2" style={{ color: "var(--muted-foreground)" }}>
              <li>{requiredOpen.length} required {requiredOpen.length === 1 ? "item is" : "items are"} missing or not reviewed</li>
              <li>
                <Link href="/readiness/files" style={{ color: "var(--foreground)" }}>{readiness.files.length} {readiness.files.length === 1 ? "file" : "files"} uploaded →</Link>
                {working > 0 && <span> · {working} being read</span>}
                {failed > 0 && <span style={{ color: "var(--red)" }}> · {failed} couldn&apos;t be read</span>}
              </li>
              {readiness.openConflicts.length > 0 && (
                <li>
                  <Link href="/questions" style={{ color: "var(--red)" }}>
                    {readiness.openConflicts.length} conflicting {readiness.openConflicts.length === 1 ? "value" : "values"} between your files →
                  </Link>
                </li>
              )}
            </ul>
            {requiredOpen.length > 0 && (
              <ul className="mt-3 text-xs space-y-1">
                {requiredOpen.slice(0, 8).map((k) => (
                  <li key={k}>
                    <Link href={itemHref(k)} style={{ color: "var(--foreground)" }}>{name(k)}</Link>
                  </li>
                ))}
                {requiredOpen.length > 8 && <li style={{ color: "var(--muted-foreground)" }}>+{requiredOpen.length - 8} more</li>}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
