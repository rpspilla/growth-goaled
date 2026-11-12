import { Faq } from "@/components/Faq";
import { PageHeader } from "@/components/PageHeader";
import { GrowthOptions } from "@/components/use-cases/GrowthOptions";
import { currentPlan } from "@/lib/data/current-plan";
import { founderContext } from "@/lib/data/founder-context";
import { track } from "@/lib/events";

/** Where a founder starts: two ways to work a problem, their current plan, or a custom project. */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [{ user, company }, { welcome }] = await Promise.all([founderContext(), searchParams]);
  if (company) await track("library_viewed", { userId: user.id, companyId: company.id });
  const plan = company ? await currentPlan(company) : null;

  return (
    <div className="px-4 sm:px-8 py-8 max-w-5xl">
      {welcome !== undefined && (
        <div className="surface p-5 mb-8" style={{ background: "var(--green-muted)", borderColor: "transparent" }} role="status">
          <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>You&apos;re set up{company ? `, ${company.name}` : ""}. Pick where you&apos;d like to start.</div>
        </div>
      )}
      <PageHeader title="What do you need to decide?" subtitle="Pick where you'd like to start. A Growth Goaled advisor works through it with you." />
      <GrowthOptions plan={plan} />
      <Faq className="mt-10 max-w-3xl" />
    </div>
  );
}
