import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { getIntakeAnswers } from "@/lib/data/intake";
import { displayValue, getSection, INTAKE_SECTIONS, percentComplete, sectionComplete } from "@/lib/intake";
import { IntakeForm } from "./IntakeForm";

export default async function IntakeSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: sectionId } = await params;
  const section = getSection(sectionId);
  if (!section) notFound();

  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) {
    return (
      <div className="p-8 max-w-4xl">
        <PageHeader title="Tell us about your company" subtitle="Your company isn't set up yet." />
      </div>
    );
  }

  const answers = await getIntakeAnswers(company);
  const values = Object.fromEntries(section.fields.map((f) => [f.id, displayValue(f, answers[`${section.id}.${f.id}`])]));

  return (
    <IntakeForm
      sections={INTAKE_SECTIONS.map((s) => ({ id: s.id, label: s.label }))}
      section={section}
      initialValues={values}
      initialPercent={percentComplete(answers)}
      initialComplete={INTAKE_SECTIONS.filter((s) => sectionComplete(s, answers)).map((s) => s.id)}
    />
  );
}
