import { ArrowUpRight, FileText } from "lucide-react";
import type { ProjectDocument } from "@/lib/db/schema";
import { documentHref } from "@/lib/project-links";

/** The one big way into a project's plan: the document the advisor wrote (Google Doc, PDF…). */
export function ReviewActionPlan({ plan, project }: { plan: ProjectDocument | null; project: string }) {
  if (!plan)
    return (
      <div className="surface p-6" aria-label={`Action plan for ${project}`} role="region">
        <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Action plan</div>
        <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>Your advisor is preparing it. It appears here as soon as it&apos;s shared.</p>
      </div>
    );
  return (
    <a
      href={documentHref(plan)}
      target="_blank"
      rel="noopener"
      aria-label={`Review Action Plan: ${project}`}
      className="surface p-6 sm:p-8 flex items-center gap-5 hover:opacity-90"
      style={{ background: "var(--green-muted)", borderColor: "var(--green)", boxShadow: "0 0 0 1px var(--green)" }}
    >
      <span className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--green)", color: "#fff" }} aria-hidden>
        <FileText size={28} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-display text-2xl sm:text-3xl leading-tight" style={{ color: "var(--foreground)" }}>Review Action Plan</span>
        <span className="block text-base mt-1" style={{ color: "var(--muted-foreground)" }}>{plan.title} · from your advisor</span>
      </span>
      <ArrowUpRight size={28} aria-hidden style={{ color: "var(--green)" }} />
    </a>
  );
}
