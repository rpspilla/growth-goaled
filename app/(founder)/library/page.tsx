import { PageHeader } from "@/components/PageHeader";
import { UseCaseCards, type CardState } from "@/components/use-cases/UseCaseCards";
import { founderContext } from "@/lib/data/founder-context";
import { track } from "@/lib/events";
import { formatPrice, pricing, sellableUseCases } from "@/lib/pricing";
import { getUseCase, recommendedUseCases, USE_CASES } from "@/lib/use-cases";

/** Growth questions: pick the decision you're facing. New founders land here straight after setup. */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [{ user, company, useCases }, { welcome }] = await Promise.all([founderContext(), searchParams]);
  const states: Record<string, CardState> = Object.fromEntries(useCases.map((u) => [u.useCase, u.activatedAt ? "active" : "started"]));
  if (company) await track("library_viewed", { userId: user.id, companyId: company.id });
  const recommended = company ? recommendedUseCases(company) : [];
  const price = formatPrice(pricing().assessmentCents);
  const first = getUseCase(recommended[0] ?? "growth_leak");

  return (
    <div className="px-4 sm:px-8 py-8 max-w-5xl">
      {welcome !== undefined && !useCases.length && (
        <div className="surface p-5 mb-8 flex gap-4 items-start" style={{ background: "var(--green-muted)", borderColor: "transparent" }} role="status">
          <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: "var(--green)", color: "#fff" }}>3</span>
          <div>
            <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>You&apos;re set up{company ? `, ${company.name}` : ""}. Last step: pick a question.</div>
            <p className="text-base mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              You&apos;ll answer a few questions and see your free Growth Snapshot straight away. Not sure where to start? &ldquo;{first?.question}&rdquo; is recommended for your stage.
            </p>
          </div>
        </div>
      )}
      <PageHeader
        title="What do you need to decide?"
        subtitle={`Pick the question you're facing. A few answers get you a free Growth Snapshot; a full assessment from your own data is ${price}, only if you want it.`}
      />
      <UseCaseCards useCases={USE_CASES} recommended={recommended} states={states} hrefFor={(id) => `/library/${id}`} price={price} sellable={sellableUseCases()} />
    </div>
  );
}
