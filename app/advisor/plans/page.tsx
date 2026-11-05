import Link from "next/link";
import { formatPrice, pricing } from "@/lib/pricing";
import { PageHeader } from "@/components/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { Section } from "@/components/ui/Section";
import { requireRole } from "@/lib/auth/session";
import { plansForReview, REVIEW_HOURS, supportedPlans } from "@/lib/data/action-plans";

const when = (d: Date) => d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Action plans: $499 plans waiting for approval (due within 24 hours of submission), and live supported plans. */
export default async function AdvisorPlansPage() {
  const user = await requireRole(["advisor", "admin"]);
  const [review, supported] = await Promise.all([plansForReview(user), supportedPlans(user)]);
  return (
    <div className="px-4 sm:px-8 py-8 max-w-5xl space-y-12">
      <PageHeader title="Action plans" subtitle={`Approve submitted plans within ${REVIEW_HOURS} hours; supported plans have you in the founder's conversation.`} />

      <Section id="review" title={`To approve (${review.length})`} lead={`Diagnose (${formatPrice(pricing().actionPlanCents)}) plans the founder has submitted. Check the draft against the conversation, edit it, and approve to deliver it.`}>
        {review.length ? (
          <ul className="surface divide-y" style={{ borderColor: "var(--border)" }}>
            {review.map((r) => {
              const { due, overdue: late } = r;
              return (
                <li key={r.plan.id} style={{ borderColor: "var(--border)" }}>
                  <Link href={`/advisor/plans/${r.plan.id}`} className="flex items-center gap-4 p-4 hover:bg-[var(--muted)] rounded-xl flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{r.company}</div>
                      <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{r.title}</div>
                    </div>
                    {r.plan.status === "drafting" && <Pill tone="blue">Drafting</Pill>}
                    {due && <Pill tone={late ? "red" : "amber"}>{late ? "Overdue" : "Due"} {when(due)}</Pill>}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="surface surface-pad text-base" style={{ color: "var(--muted-foreground)" }}>Nothing waiting.</p>
        )}
      </Section>

      <Section id="supported" title={`Supported plans (${supported.length})`} lead={`Execute & Monitor, ${formatPrice(pricing().supportedMonthlyCents)}/month. You're in these conversations with the founder; the newest activity is first.`}>
        {supported.length ? (
          <ul className="surface divide-y" style={{ borderColor: "var(--border)" }}>
            {supported.map((r) => (
              <li key={r.plan.id} style={{ borderColor: "var(--border)" }}>
                <Link href={`/advisor/plans/${r.plan.id}`} className="flex items-center gap-4 p-4 hover:bg-[var(--muted)] rounded-xl flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{r.company}</div>
                    <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{r.title}</div>
                  </div>
                  <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Last activity {when(r.lastActivity)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="surface surface-pad text-base" style={{ color: "var(--muted-foreground)" }}>No supported plans yet.</p>
        )}
      </Section>
    </div>
  );
}
