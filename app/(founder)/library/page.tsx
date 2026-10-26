import { PageHeader } from "@/components/PageHeader";
import { UseCaseCards, type CardState } from "@/components/use-cases/UseCaseCards";
import { founderContext } from "@/lib/data/founder-context";
import { track } from "@/lib/events";
import { recommendedUseCases, USE_CASES } from "@/lib/use-cases";

export default async function LibraryPage() {
  const { user, company, useCases } = await founderContext();
  const states: Record<string, CardState> = Object.fromEntries(useCases.map((u) => [u.useCase, u.activatedAt ? "active" : "started"]));
  if (company) await track("library_viewed", { userId: user.id, companyId: company.id });

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Use Case Library"
        subtitle="Each use case answers one question from your own data, then tracks your progress toward the goal you set. Browsing and setting your objective are free."
      />
      <UseCaseCards useCases={USE_CASES} recommended={company ? recommendedUseCases(company) : []} states={states} hrefFor={(id) => `/library/${id}`} />
    </div>
  );
}
