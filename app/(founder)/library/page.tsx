import type { ReactNode } from "react";
import { Check, ClipboardList, Handshake, Repeat, Zap } from "lucide-react";
import { Faq } from "@/components/Faq";
import { PageHeader } from "@/components/PageHeader";
import { ADVISOR_CALENDLY } from "@/components/chat/AdvisorNudge";
import { StartOptionButton } from "@/components/use-cases/StartOption";
import { founderPlans } from "@/lib/data/action-plans";
import { founderContext } from "@/lib/data/founder-context";
import { track } from "@/lib/events";
import { CUSTOM } from "@/lib/plan-offer";
import { startTopicAction } from "../chat/actions";

const PLAN_STATUS: Record<string, string> = { drafting: "Being drafted", in_review: "With your advisor for review", delivered: "Delivered", active: "Active" };

function Option({ icon, title, when, points, children, muted = false }: { icon: ReactNode; title: string; when: string; points?: string[]; children: ReactNode; muted?: boolean }) {
  return (
    <article aria-label={title} className="surface p-6 flex flex-col gap-4" style={muted ? { background: "var(--muted)" } : undefined}>
      <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "var(--green-muted)", color: "var(--green)" }} aria-hidden>
        {icon}
      </span>
      <div>
        <h2 className="font-display text-2xl" style={{ color: "var(--foreground)" }}>{title}</h2>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{when}</p>
      </div>
      {points && (
        <ul className="space-y-1.5 text-sm flex-1" style={{ color: "var(--foreground)" }}>
          {points.map((p) => (
            <li key={p} className="flex gap-2 items-start">
              <Check size={16} className="mt-0.5 shrink-0" style={{ color: "var(--green)" }} aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-1 flex flex-wrap items-center gap-3">{children}</div>
    </article>
  );
}

/** Where a founder starts: two ways to work a problem, their current plan, or a custom project. */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [{ user, company }, { welcome }] = await Promise.all([founderContext(), searchParams]);
  if (company) await track("library_viewed", { userId: user.id, companyId: company.id });
  const [plan] = company ? await founderPlans(company) : [];

  return (
    <div className="px-4 sm:px-8 py-8 max-w-5xl">
      {welcome !== undefined && (
        <div className="surface p-5 mb-8" style={{ background: "var(--green-muted)", borderColor: "transparent" }} role="status">
          <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>You&apos;re set up{company ? `, ${company.name}` : ""}. Pick where you&apos;d like to start.</div>
        </div>
      )}
      <PageHeader title="What do you need to decide?" subtitle="Pick where you'd like to start. A Growth Goaled advisor works through it with you." />
      <div className="grid md:grid-cols-2 gap-5">
        <Option icon={<Repeat size={22} />} title="Build a repeatable sales motion" when="Many customer types, and you need focus." points={["Which customers do we win, keep and grow best?", "Which segments should we stop chasing?", "Where should sales focus next?"]}>
          <form action={startTopicAction}>
            <input type="hidden" name="topic" value="revenue_engine" />
            <StartOptionButton label="Start" />
          </form>
        </Option>
        <Option icon={<Zap size={22} />} title="Revenue conversion sprint" when="There's pipeline, but not enough of it turns into revenue." points={["Where are deals stalling or being lost?", "Which fixes will lift conversion fastest?", "What to change over the next few weeks"]}>
          <form action={startTopicAction}>
            <input type="hidden" name="topic" value="pipeline_conversion" />
            <StartOptionButton label="Start" />
          </form>
        </Option>
        <Option icon={<ClipboardList size={22} />} title="See my current plan" when={plan ? `${plan.title} · ${PLAN_STATUS[plan.status] ?? plan.status}` : "Your plan will show here once you start one with your advisor."} muted={!plan}>
          {plan ? (
            <a href={`/chat/${plan.conversationId}#your-plan`} className="btn btn-primary">Open my plan</a>
          ) : (
            <a href={ADVISOR_CALENDLY} target="_blank" rel="noopener" className="btn btn-secondary">Schedule time with an advisor</a>
          )}
        </Option>
        <Option icon={<Handshake size={22} />} title="Custom Project" when={CUSTOM.tagline} points={CUSTOM.points}>
          <a href={CUSTOM.href} target="_blank" rel="noopener" className="btn btn-secondary">{CUSTOM.cta}</a>
        </Option>
      </div>
      <Faq className="mt-10 max-w-3xl" />
    </div>
  );
}
