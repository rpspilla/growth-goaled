import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { DataNeeded } from "@/components/use-cases/DataNeeded";
import { ObjectiveForm } from "@/components/use-cases/ObjectiveForm";
import { founderContext } from "@/lib/data/founder-context";
import { track } from "@/lib/events";
import { formatPrice, stripeConfigured, USE_CASE_PRICE_CENTS } from "@/lib/stripe";
import { getUseCase, objectiveFields } from "@/lib/use-cases";
import { saveAnswer, startUseCaseCheckout } from "../actions";

const card = { background: "var(--card)", borderColor: "var(--border)" };

export default async function UseCasePage({ params, searchParams }: { params: Promise<{ useCase: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const [{ useCase: id }, { checkout }] = await Promise.all([params, searchParams]);
  const def = getUseCase(id);
  if (!def) notFound();
  const { user, company, useCases } = await founderContext();
  const row = useCases.find((u) => u.useCase === def.id);
  if (company) await track("use_case_viewed", { userId: user.id, companyId: company.id, props: { use_case: def.id } });

  return (
    <div className="p-8 max-w-6xl">
      <Link href="/library" className="text-xs" style={{ color: "var(--muted-foreground)" }}>← Use Case Library</Link>
      <PageHeader eyebrow={def.shortTitle} title={def.question} subtitle={def.whenUseful} />
      {checkout === "cancelled" && (
        <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>Payment cancelled. Your answers are saved; you can continue whenever you&apos;re ready.</p>
      )}
      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 rounded-xl border p-6" style={card}>
          <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--foreground)" }}>Your objective</h2>
          <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
            Tell us what you&apos;re trying to achieve. Your answers shape the baseline and plan, and your target is shown as yours, never as our analysis.
          </p>
          {company ? (
            <ObjectiveForm
              useCaseId={def.id}
              fields={objectiveFields(def)}
              initial={row?.objective ?? {}}
              save={saveAnswer}
              checkout={startUseCaseCheckout}
              price={formatPrice(USE_CASE_PRICE_CENTS)}
              activated={Boolean(row?.activatedAt)}
              paymentsReady={stripeConfigured()}
            />
          ) : (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Your company isn&apos;t set up yet.</p>
          )}
        </section>
        <aside className="space-y-6">
          <div className="rounded-xl border p-5" style={card}>
            <div className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>What you get</div>
            <ul className="text-sm space-y-1" style={{ color: "var(--muted-foreground)" }}>
              {def.youGet.map((g) => <li key={g}>• {g}</li>)}
            </ul>
          </div>
          <div className="rounded-xl border p-5" style={card}>
            <div className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>Data we&apos;ll ask for</div>
            <DataNeeded useCase={def} />
          </div>
        </aside>
      </div>
    </div>
  );
}
