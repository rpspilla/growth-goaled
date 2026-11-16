import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { founderContext } from "@/lib/data/founder-context";
import { companyProjects } from "@/lib/data/projects";
import { projectDay } from "@/lib/project-links";

export const metadata = { title: "Growth Projects" };

/** Growth Projects: the history of the advisor's work with the company, open and completed. Advisors manage it. */
export default async function ProjectsPage() {
  const { company } = await founderContext();
  if (!company) redirect("/welcome");
  const projects = await companyProjects(company);
  return (
    <div className="page space-y-6">
      <PageHeader title="Growth Projects" subtitle="The projects your Growth Goaled advisor is running with you, and the ones you've completed." />
      {projects.length === 0 ? (
        <div className="surface p-6 text-base" style={{ color: "var(--muted-foreground)" }}>
          No growth projects yet. When your advisor starts one, it appears here with its plan and results.
        </div>
      ) : (
        <ul aria-label="Growth project history" className="surface divide-y" style={{ borderColor: "var(--border)" }}>
          {projects.map((p) => (
            <li key={p.id} style={{ borderColor: "var(--border)" }}>
              <Link href={`/projects/${p.id}`} className="flex items-center gap-4 p-5 hover:bg-[var(--muted)] rounded-xl flex-wrap">
                <div className="flex-1 min-w-[14rem]">
                  <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>{p.name}</div>
                  <dl className="text-sm mt-0.5 flex gap-x-4 gap-y-0.5 flex-wrap" style={{ color: "var(--muted-foreground)" }}>
                    <div><dt className="inline">Started: </dt><dd className="inline">{projectDay(p.startedOn)}</dd></div>
                    {p.completedOn && <div><dt className="inline">Completed: </dt><dd className="inline">{projectDay(p.completedOn)}</dd></div>}
                  </dl>
                </div>
                <Pill tone={p.status === "completed" ? "neutral" : "green"}>Status: {p.status === "completed" ? "Completed" : "Open"}</Pill>
                <span aria-hidden style={{ color: "var(--muted-foreground)" }}>→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
