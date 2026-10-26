import { PageHeader } from "@/components/PageHeader";
import { UseCaseCards, type CardState } from "@/components/use-cases/UseCaseCards";
import { founderContext } from "@/lib/data/founder-context";
import { track } from "@/lib/events";
import { formatPrice, pricing, sellableUseCases } from "@/lib/pricing";
import { recommendedUseCases, USE_CASES } from "@/lib/use-cases";

export default async function LibraryPage() {
  const { user, company, useCases } = await founderContext();
  const states: Record<string, CardState> = Object.fromEntries(useCases.map((u) => [u.useCase, u.activatedAt ? "active" : "started"]));
  if (company) await track("library_viewed", { userId: user.id, companyId: company.id });

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Use Case Library"
        subtitle="Six decisions founders face. Pick one to answer a few questions and get a free Growth Snapshot; buy the full assessment when you're ready."
      />
      <UseCaseCards
        useCases={USE_CASES} recommended={company ? recommendedUseCases(company) : []} states={states} hrefFor={(id) => `/library/${id}`}
        price={formatPrice(pricing().assessmentCents)}
        sellable={sellableUseCases()}
      />
    </div>
  );
}
