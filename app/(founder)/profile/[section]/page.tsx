import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { getIntakeAnswers } from "@/lib/data/intake";
import { displayValue, getSection, INTAKE_SECTIONS, percentComplete, sectionComplete, type IntakeAnswers } from "@/lib/intake";
import { REVENUE_BANDS } from "@/lib/onboarding";
import { IntakeForm } from "./IntakeForm";

export default async function IntakeSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: sectionId } = await params;
  const section = getSection(sectionId);
  if (!section) notFound();

  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) {
    return (
      <div className="px-4 sm:px-8 py-8 max-w-4xl">
        <PageHeader title="Tell us about your company" subtitle="Your company isn't set up yet." />
      </div>
    );
  }

  const answers = await getIntakeAnswers(company);
  const values = Object.fromEntries(section.fields.map((f) => [f.id, displayValue(f, answers[`${section.id}.${f.id}`])]));
  // What the founder already told us elsewhere, shown under the field so nothing is asked twice.
  const hints: Record<string, string> = {};
  const band = REVENUE_BANDS.find((b) => b.value === company.revenueBand);
  if (section.id === "company" && band && !values.arr && !answers["company.arr_range"]) hints.arr = `You told us ${band.label} at sign-up. Add the exact figure if you know it.`;

  return (
    <IntakeForm
      sections={INTAKE_SECTIONS.map((s) => ({ id: s.id, label: s.label }))}
      section={section}
      initialValues={values}
      hints={hints}
      team={section.id === "hiring" ? currentTeam(answers) : null}
      initialPercent={percentComplete(answers)}
      initialComplete={INTAKE_SECTIONS.filter((s) => sectionComplete(s, answers)).map((s) => s.id)}
    />
  );
}

/** The current go-to-market team from the GTM answers, for the hiring section (never re-entered). */
function currentTeam(answers: IntakeAnswers): { label: string; value: string }[] {
  const rows: [string, string][] = [
    ["gtm.sales_reps", "Account executives"],
    ["gtm.sdrs", "BDRs / SDRs"],
    ["gtm.cs", "Customer success"],
    ["gtm.marketing", "Marketing"],
    ["gtm.partnerships", "Partnerships"],
  ];
  return rows.flatMap(([key, label]) => {
    const v = answers[key];
    return v === null || v === undefined || v === "" ? [] : [{ label, value: String(v) }];
  });
}
