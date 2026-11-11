"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { Pill } from "@/components/ui/Pill";
import type { ActionPlanContent, PlanTarget } from "@/lib/db/schema";
import { formatMinutes } from "@/lib/plan-tracking";
import { ActionPlanView } from "./ActionPlanView";

type Result = { ok: boolean; error?: string };
export type PlanPanelData = {
  id: string;
  tier: "plan" | "supported";
  status: "collecting" | "drafting" | "in_review" | "delivered" | "active" | "cancelled";
  needs: string[];
  content: ActionPlanContent | null;
  drafting: boolean;
  expectedBy: string | null;
  approvedOn: string | null;
  reviewNote: string | null;
  advisorName: string | null;
  /** Execute & Monitor: where "Manage billing" goes (Stripe's portal, via /billing). */
  billingHref: string | null;
  /** Today (YYYY-MM-DD), for overdue milestones. */
  today: string;
  /** The company's latest figure per metric, for targets. */
  current: Record<string, number | null>;
  /** Execute & Monitor: live CRO time this month and the last progress review. */
  live: { usedMinutes: number; allowanceMinutes: number; lastReview: string | null; reviewHref: string; supportHref: string } | null;
};

/** The action plan bought from this conversation, at whatever stage it's at. */
export function PlanPanel({
  plan,
  submit,
  update,
  move,
  assign,
  startPlan,
  editStep,
  saveTargets,
}: {
  plan: PlanPanelData;
  submit: (id: string) => Promise<Result>;
  update: (id: string) => Promise<Result>;
  move: (id: string, period: string, index: number, status: string) => Promise<Result>;
  assign: (id: string, period: string, index: number, assignee: string) => Promise<Result>;
  startPlan: (id: string) => Promise<Result>;
  editStep: (id: string, period: string, index: number, owner: string, due: string | null) => Promise<Result>;
  saveTargets: (id: string, targets: PlanTarget[]) => Promise<Result>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      router.refresh();
    });
  const working = plan.status === "drafting" || plan.drafting || (plan.status === "active" && !plan.content);
  const tierLabel = plan.tier === "supported" ? "Supported plan" : "Action plan";

  return (
    <section id="your-plan" aria-label="Your action plan" className="surface p-5 sm:p-6 space-y-4 scroll-mt-20" style={{ borderColor: "var(--green)" }}>
      <BuildingRefresh active={working} />
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-xl font-semibold flex-1" style={{ color: "var(--foreground)" }}>Your {tierLabel.toLowerCase()}</h2>
        {plan.status === "collecting" && <Pill tone="blue">Gathering what it needs</Pill>}
        {(plan.status === "drafting" || plan.status === "in_review") && <Pill tone="amber">With your advisor for review</Pill>}
        {plan.status === "delivered" && <Pill tone="green">Approved by your advisor</Pill>}
        {plan.status === "active" && <Pill tone="green">Supported{plan.advisorName ? ` · ${plan.advisorName}` : ""}</Pill>}
        {plan.status === "cancelled" && <Pill tone="neutral">Support ended</Pill>}
      </div>

      {plan.status === "collecting" && (
        <div className="space-y-3">
          <p className="text-base" style={{ color: "var(--foreground)" }}>
            Keep talking it through below, and attach any files that help (CRM exports, revenue by customer, org chart, comp plans). When you&apos;re ready, submit it: an advisor reviews and approves your plan, usually within 24 hours.
          </p>
          {plan.needs.length > 0 ? (
            <div>
              <div className="label mb-1">Still useful to have</div>
              <ul className="list-disc pl-5 text-base space-y-0.5" style={{ color: "var(--foreground)" }}>
                {plan.needs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-base" style={{ color: "var(--green)" }}>We have what we need for a strong plan.</p>
          )}
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => submit(plan.id))}>
            {pending ? "Submitting…" : "Submit my plan for review"}
          </button>
          {plan.needs.length > 0 && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>You can submit now; the plan will say what the missing information would change.</p>}
        </div>
      )}

      {(plan.status === "drafting" || plan.status === "in_review") && (
        <p className="text-base" style={{ color: "var(--foreground)" }}>
          Submitted. An advisor is reviewing your plan and will approve it{plan.expectedBy ? ` by ${plan.expectedBy}` : " within 24 hours"}. We&apos;ll email you when it&apos;s ready. You can keep the conversation going in the meantime.
        </p>
      )}

      {plan.status === "active" && !plan.content && <p className="text-base" style={{ color: "var(--muted-foreground)" }}>Writing your first draft from this conversation…</p>}

      {plan.content && (plan.status === "delivered" || plan.status === "active" || plan.status === "cancelled") && (
        <>
          {plan.status === "delivered" && (plan.approvedOn || plan.reviewNote) && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {plan.approvedOn ? `Approved on ${plan.approvedOn}.` : ""} {plan.reviewNote ? `Advisor's note: ${plan.reviewNote}` : ""}
            </p>
          )}
          {plan.live && <LiveSupport live={plan.live} />}
          <ActionPlanView
            content={plan.content}
            today={plan.status === "cancelled" ? null : plan.today}
            move={plan.status === "cancelled" ? undefined : (period, index, status) => move(plan.id, period, index, status)}
            assign={plan.status === "cancelled" ? undefined : (period, index, who) => assign(plan.id, period, index, who)}
            start={plan.status === "cancelled" ? undefined : () => startPlan(plan.id)}
            editStep={plan.status === "active" ? (period, index, owner, due) => editStep(plan.id, period, index, owner, due) : undefined}
            targets={{ current: plan.current, save: plan.status === "active" ? (targets) => saveTargets(plan.id, targets) : undefined }}
          />
          {plan.status === "active" && (
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" className="btn btn-secondary" disabled={pending || plan.drafting} onClick={() => run(() => update(plan.id))}>
                {plan.drafting ? "Updating…" : "Update the plan from this conversation"}
              </button>
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Your advisor sees everything here and can add to it.</span>
            </div>
          )}
          {plan.billingHref && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              <a href={plan.billingHref} className="link">Manage billing</a> to change your card, see invoices or cancel (cancelling takes effect at the end of the month you&apos;ve paid for).
            </p>
          )}
        </>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </section>
  );
}

/** Execute & Monitor: the CRO time included each month, and the next review. */
function LiveSupport({ live }: { live: NonNullable<PlanPanelData["live"]> }) {
  const left = Math.max(0, live.allowanceMinutes - live.usedMinutes);
  return (
    <section aria-label="Your CRO advisor" className="rounded-xl p-4 flex gap-4 items-center flex-wrap" style={{ background: "var(--green-muted)" }}>
      <div className="flex-1 min-w-[14rem] text-sm space-y-0.5" style={{ color: "var(--foreground)" }}>
        <div>
          <strong>Live CRO support this month:</strong> {formatMinutes(live.usedMinutes)} of {formatMinutes(live.allowanceMinutes)} used{left > 0 ? `, ${formatMinutes(left)} left` : ""}.
        </div>
        <div style={{ color: "var(--muted-foreground)" }}>{live.lastReview ? `Last progress review: ${live.lastReview}.` : "Book your first monthly progress review."}</div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <a href={live.reviewHref} className="btn btn-primary text-sm">Book your monthly review</a>
        <a href={live.supportHref} className="btn btn-secondary text-sm">Book live support</a>
      </div>
    </section>
  );
}
