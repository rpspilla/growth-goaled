import { ActivateForm } from "@/components/use-cases/ActivateForm";
import { userName } from "@/lib/data/portfolio";
import { answeredObjectiveFields, recommendedUseCases, USE_CASES } from "@/lib/use-cases";
import { activateForCompany } from "../actions";
import { companyContext } from "../context";

const card = { background: "var(--card)", borderColor: "var(--border)" };

/** Step 2 mirrored: the founder's objective answers per use case, and pilot activation. */
export default async function CompanyLibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { company, useCases } = await companyContext((await params).id);
  const recommended = recommendedUseCases(company);
  const activators = new Map(await Promise.all(useCases.filter((u) => u.activatedBy).map(async (u) => [u.activatedBy!, await userName(u.activatedBy)] as const)));

  return (
    <div className="px-4 sm:px-8 py-8 max-w-5xl space-y-6">
      <div>
        <div className="label mb-1" style={{ color: "var(--muted-foreground)" }}>Step 2 · Growth questions</div>
        <h1 className="font-display text-3xl font-normal" style={{ color: "var(--foreground)" }}>{company.name}: use cases</h1>
      </div>
      {USE_CASES.map((def) => {
        const row = useCases.find((u) => u.useCase === def.id);
        const answers = answeredObjectiveFields(def).filter((f) => row?.objective[f.id]);
        return (
          <section key={def.id} className="rounded-xl border p-5 space-y-3" style={{ ...card, borderColor: row?.activatedAt ? "var(--green)" : "var(--border)" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{def.shortTitle}</h2>
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{def.question}</span>
              {recommended.includes(def.id) && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--green-muted)", color: "var(--green)" }}>Recommended</span>}
              <span className="ml-auto text-xs font-medium" style={{ color: row?.activatedAt ? "var(--green)" : "var(--muted-foreground)" }}>
                {row?.activatedAt ? "Purchased" : def.comingSoon ? "Coming soon" : row ? "Snapshot only" : "Not started"}
              </span>
            </div>
            {row?.activatedAt && (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {row.activation === "advisor" ? `Granted without payment by ${activators.get(row.activatedBy ?? "") ?? "an advisor"}` : "Paid"} on{" "}
                {row.activatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {row.activationNote && ` · ${row.activationNote}`}
              </p>
            )}
            {answers.length > 0 ? (
              <dl className="grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {answers.map((f) => (
                  <div key={f.id}>
                    <dt className="text-xs" style={{ color: "var(--muted-foreground)" }}>{f.label}</dt>
                    <dd style={{ color: "var(--foreground)" }}>{f.options?.find((o) => o.value === row!.objective[f.id])?.label ?? row!.objective[f.id]}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>No questionnaire answers yet.</p>
            )}
            {!row?.activatedAt &&
              (def.comingSoon ? (
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Coming soon: can&apos;t be started or granted yet.</p>
              ) : (
                <ActivateForm companyId={company.id} useCase={def.id} activate={activateForCompany} />
              ))}
          </section>
        );
      })}
    </div>
  );
}
