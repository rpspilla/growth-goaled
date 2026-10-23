import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { loadAnalytics } from "@/lib/data/analytics";

const EVENTS = [
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
  const a = await loadAnalytics();
  const card = { background: "var(--card)", borderColor: "var(--border)" };
  const tiles = [
    { label: "Activation", value: a.activation.value, unit: "%", m: a.activation },
    { label: "Sign-up to first Benchmark", value: a.hoursToFirstBenchmark.value, unit: "h", m: a.hoursToFirstBenchmark },
    { label: "Source trails opened", value: a.sourceTrailRate.value, unit: "%", m: a.sourceTrailRate },
    { label: "Review turnaround", value: a.reviewTurnaround.value, unit: "h", m: a.reviewTurnaround },
    { label: "Approved without changes", value: a.approvedWithoutChanges.value, unit: "%", m: a.approvedWithoutChanges },
  ];

  return (
    <div className="p-8 max-w-6xl space-y-6">
      <PageHeader title="Analytics" subtitle="Product metrics across real companies (the sample company is excluded)." />
      <div className="grid grid-cols-5 gap-4">
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
        <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}>
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
