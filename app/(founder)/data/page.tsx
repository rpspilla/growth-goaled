import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { CheckCircle2, Circle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { InboxDropzone } from "@/components/readiness/InboxDropzone";
import { Section } from "@/components/ui/Section";
import { db, schema } from "@/lib/db";
import { listRegisterItems } from "@/lib/data/registers";
import { DATA_SOURCE_GROUPS, latestFor } from "@/lib/data-sources";
import { loadReadiness } from "./load";

// File reading runs after the upload action responds (next/server after()), within this budget.
export const maxDuration = 300;

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Data: one shared place for the founder and advisor to collect and keep the company's data up to
 * date, for every growth project. CRM deals first, then billing and accounting. Drop any export;
 * each file is read and sorted, and its figures flow into Performance and the advisor's work.
 */
export default async function DataPage() {
  const data = await loadReadiness();
  if (!data) {
    return (
      <div className="page">
        <PageHeader title="Data" subtitle="Your company isn't set up yet. Contact your advisor if this persists." />
      </div>
    );
  }
  const { company, blobPrefix } = data;
  const [files, questions] = await Promise.all([
    db
      .select({ id: schema.documents.id, filename: schema.documents.filename, createdAt: schema.documents.createdAt, status: schema.documents.status })
      .from(schema.documents)
      .where(eq(schema.documents.companyId, company.id))
      .orderBy(desc(schema.documents.createdAt))
      .limit(200),
    listRegisterItems([company.id], { owner: "founder", status: "open" }),
  ]);

  return (
    <div className="page space-y-10">
      <PageHeader title="Data" subtitle="One place for you and your advisor to collect and keep your company's data up to date. Drop any export; we read and sort it." />

      {questions.length > 0 && (
        <Link href="/data/questions" className="block rounded-xl border p-4 text-base font-semibold" style={{ background: "var(--card)", borderColor: "var(--amber)", color: "var(--foreground)" }}>
          {questions.length} {questions.length === 1 ? "item" : "items"} to review with your advisor →
        </Link>
      )}

      <InboxDropzone blobPrefix={blobPrefix} />

      {DATA_SOURCE_GROUPS.map((g) => (
        <Section key={g.id} id={`data-${g.id}`} title={g.title} lead={g.lead}>
          <ul aria-label={g.title} className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {g.sources.map((s) => {
              const latest = latestFor(s, files);
              return (
                <li key={s.id} className="surface p-5 space-y-2">
                  <div className="flex items-center gap-2">
                    {latest ? <CheckCircle2 size={18} aria-hidden style={{ color: "var(--green)" }} /> : <Circle size={18} aria-hidden style={{ color: "var(--muted-foreground)" }} />}
                    <h3 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{s.title}</h3>
                  </div>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{s.what}</p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <span className="font-semibold">Export: </span>
                    {s.export}
                  </p>
                  <p className="text-sm" style={{ color: latest ? "var(--green)" : "var(--muted-foreground)" }}>
                    {latest ? `Last updated ${day(latest.createdAt)} · ${latest.filename}` : "Not shared yet"}
                  </p>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}

      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        Live connections to Stripe, Xero, QuickBooks and your CRM are coming. Until then, exports work the same way. Everything you&apos;ve shared is under <Link href="/documents" className="link">Documents</Link>.
      </p>
    </div>
  );
}
