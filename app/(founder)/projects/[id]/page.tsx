import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pill } from "@/components/ui/Pill";
import { Section } from "@/components/ui/Section";
import { ProjectDocuments } from "@/components/projects/ProjectDocuments";
import { ReviewActionPlan } from "@/components/projects/ReviewActionPlan";
import { founderContext } from "@/lib/data/founder-context";
import { companyProject } from "@/lib/data/projects";
import { projectDay } from "@/lib/project-links";
import { CommitmentList } from "@/components/projects/CommitmentList";
import { commitmentItems } from "@/lib/commitments";
import { companyCommitments } from "@/lib/data/commitments";
import { today } from "@/lib/data/projects";
import { commitmentOutcomeAction, commitmentStatusAction, rescheduleCommitmentAction } from "../../chat/actions";

/**
 * One growth project, as the founder sees it: the Review Action Plan card (the advisor's document),
 * the commitments made with their AI CRO (ticked off here), the results the advisor has approved,
 * and the documents shared on it.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const p = await companyProject(company, id);
  if (!p) notFound();
  const commitments = await companyCommitments(company, { projectIds: [p.id] });
  return (
    <div className="page space-y-8">
      <div>
        <Link href="/projects" className="link text-sm">← Growth Projects</Link>
        {p.conversationId && (
          <Link href={`/chat/${p.conversationId}`} className="link text-sm ml-4">The conversation it came from →</Link>
        )}
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <h1 className="font-display text-3xl sm:text-4xl" style={{ color: "var(--foreground)" }}>{p.name}</h1>
          <Pill tone={p.status === "completed" ? "neutral" : "green"}>{p.status === "completed" ? "Completed" : "Open"}</Pill>
        </div>
        <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>
          Started {projectDay(p.startedOn)}
          {p.completedOn ? ` · completed ${projectDay(p.completedOn)}` : ""}
        </p>
      </div>

      <ReviewActionPlan plan={p.actionPlan} project={p.name} />

      {commitments.length > 0 && (
        <Section id="commitments" title="Commitments" lead="What you committed to with your CRO for this project.">
          <CommitmentList items={commitmentItems(commitments, new Map([[p.id, p.name]]), today(), { withProject: false })} label={`Commitments of ${p.name}`} actions={{ setStatus: commitmentStatusAction, setOutcome: commitmentOutcomeAction, reschedule: rescheduleCommitmentAction }} />
        </Section>
      )}

      <Section id="results" title="Results" lead="The outcomes your advisor tracks for this project.">
        {p.results.length ? (
          <dl className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {p.results.map((r) => (
              <div key={r.id} className="surface p-5">
                <dt className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>{r.label}</dt>
                {r.value && <dd className="text-2xl font-semibold mt-1" style={{ color: "var(--foreground)" }}>{r.value}</dd>}
                {r.note && <dd className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{r.note}</dd>}
              </div>
            ))}
          </dl>
        ) : (
          <div className="surface p-5 text-base" style={{ color: "var(--muted-foreground)" }}>Results appear here once your advisor has reviewed and approved them.</div>
        )}
      </Section>

      {p.documents.length > 0 && (
        <Section id="documents" title="Documents">
          <ProjectDocuments documents={p.documents} project={p.name} />
        </Section>
      )}
    </div>
  );
}
