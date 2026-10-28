import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { loadAnalytics, loadFunnel } from "@/lib/data/analytics";
import { AiCheck } from "@/components/admin/AiCheck";
import { apiKeyProblem } from "@/lib/ai/config";
import { testAiConnection } from "./actions";

const EVENTS = [
  "signup_viewed",
  "signup_started",
  "signup_submitted",
  "signup_link_sent",
  "signup_failed",
  "welcome_viewed",
  "onboarding_completed",
  "library_viewed",
  "use_case_viewed",
  "objective_saved",
  "checkout_started",
  "use_case_activated",
  "snapshot_viewed",
  "advisory_requested",
  "advisory_link_opened",
  "benchmark_unlocked",
  "intake_section_completed",
  "document_uploaded",
  "extraction_completed",
  "register_item_resolved",
  "review_decision",
  "deliverable_published",
  "deliverable_viewed",
  "source_trail_opened",
  "invite_sent",
  "invite_accepted",
];

export default async function AnalyticsPage() {
  await requireRole(["admin"]);
  const [a, funnel] = await Promise.all([loadAnalytics(), loadFunnel()]);
  const top = funnel.steps[0]?.value || 0;
  const card = { background: "var(--card)", borderColor: "var(--border)" };
  const tiles = [
    { label: "Activation", value: a.activation.value, unit: "%", m: a.activation },
    { label: "Sign-up to first Benchmark", value: a.hoursToFirstBenchmark.value, unit: "h", m: a.hoursToFirstBenchmark },
    { label: "Source trails opened", value: a.sourceTrailRate.value, unit: "%", m: a.sourceTrailRate },
    { label: "Review turnaround", value: a.reviewTurnaround.value, unit: "h", m: a.reviewTurnaround },
    { label: "Approved without changes", value: a.approvedWithoutChanges.value, unit: "%", m: a.approvedWithoutChanges },
  ];

  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl space-y-6">
      <PageHeader title="Analytics" subtitle="Product metrics across real companies (the sample company is excluded)." />

      <div className="rounded-xl border p-5 space-y-3" style={card}>
        <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>System checks</div>
        {[
          { label: "Anthropic API key", problem: apiKeyProblem(process.env.ANTHROPIC_API_KEY) },
          { label: "File storage (Vercel Blob)", problem: process.env.BLOB_READ_WRITE_TOKEN ? null : "BLOB_READ_WRITE_TOKEN isn't set." },
          { label: "Email (Resend)", problem: process.env.RESEND_API_KEY ? null : "RESEND_API_KEY isn't set; invite emails won't send." },
          { label: "Payments (Stripe)", problem: process.env.STRIPE_SECRET_KEY ? null : "STRIPE_SECRET_KEY isn't set; founders can't unlock the preliminary Benchmark." },
          { label: "Stripe webhook", problem: process.env.STRIPE_WEBHOOK_SECRET ? null : "STRIPE_WEBHOOK_SECRET isn't set; payments unlock only when the founder returns from checkout." },
        ].map((c) => (
          <div key={c.label} className="text-sm flex gap-2">
            <span style={{ color: c.problem ? "var(--red)" : "var(--green)" }}>{c.problem ? "✕" : "✓"}</span>
            <span style={{ color: "var(--foreground)" }}>{c.label}</span>
            {c.problem && <span className="text-xs" style={{ color: "var(--red)" }}>{c.problem}</span>}
          </div>
        ))}
        <AiCheck test={testAiConnection} />
      </div>
      <div className="rounded-xl border p-5" style={card} aria-label="Sign-up and activation funnel">
        <div className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Sign-up and activation · last 30 days</div>
        <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
          From the sign-up page to opened results. Early steps count visits (people aren&apos;t signed in yet); later steps count distinct founders. Too few visitors for A/B tests: use this to find where people drop off.
        </p>
        <ol className="space-y-2">
          {funnel.steps.map((s, i) => {
            const prev = i > 0 ? funnel.steps[i - 1]!.value : null;
            const width = top ? Math.max(2, Math.round((s.value / top) * 100)) : 0;
            return (
              <li key={s.key} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 text-sm">
                <span style={{ color: "var(--foreground)" }}>{s.label}</span>
                <span className="h-2.5 rounded-full" style={{ background: "var(--muted)" }}>
                  <span className="block h-2.5 rounded-full" style={{ width: `${width}%`, background: "var(--green)" }} />
                </span>
                <span className="font-mono text-right whitespace-nowrap" style={{ color: "var(--foreground)" }}>
                  {s.value} <span style={{ color: "var(--muted-foreground)" }}>{s.unit}{prev ? ` · ${Math.round((s.value / prev) * 100)}%` : ""}</span>
                </span>
              </li>
            );
          })}
        </ol>
        {funnel.failures > 0 && (
          <p className="text-sm mt-3" style={{ color: "var(--muted-foreground)" }}>
            Sign-up errors: {funnel.failures} ({Object.entries(funnel.reasons).map(([r, n]) => `${r.replace(/_/g, " ")} ${n}`).join(", ")})
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border p-4" style={card}>
            <div className="font-mono text-2xl font-semibold mb-1" style={{ color: "var(--foreground)" }}>
              {t.value === null ? "—" : `${t.value}${t.unit}`}
            </div>
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--foreground)" }}>{t.label}</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{t.m.count} {t.m.note}</div>
          </div>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Pilot → paid isn&apos;t tracked yet: payments aren&apos;t part of Phase 1.</p>

      <div className="rounded-xl border overflow-hidden" style={card}>
        <div className="px-5 py-3 border-b label" style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}>
          Events · last 30 days
        </div>
        {EVENTS.map((name) => (
          <div key={name} className="flex justify-between px-5 py-2.5 border-b text-sm" style={{ borderColor: "var(--border)" }}>
            <span className="font-mono text-xs" style={{ color: "var(--foreground)" }}>{name}</span>
            <span className="font-mono" style={{ color: "var(--foreground)" }}>{a.eventCounts30d[name] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
