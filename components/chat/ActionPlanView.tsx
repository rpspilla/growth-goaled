"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { HumanPresence } from "@/components/brand/HumanPresence";
import type { ActionPlanContent, PlanStep, PlanTarget } from "@/lib/db/schema";
import { allSteps, BOARD, PERIOD_LABEL, stepStatus, type Period, type StepStatus } from "@/lib/plan-board";
import { PlanTargets } from "./PlanTargets";
import { StepMeta } from "./StepMeta";

type Result = { ok: boolean; error?: string };

/**
 * The plan as a board: every milestone moves left to right across To do, In progress and Complete
 * (drag it, or use the arrows). Each card has who takes responsibility: the founder's team, or
 * Growth Goaled; starting the plan (or a later switch) sends Growth Goaled's share to the advisor.
 */
export function ActionPlanView({
  content,
  today = null,
  editStep,
  targets,
  move,
  assign,
  start,
}: {
  content: ActionPlanContent;
  /** YYYY-MM-DD from the server, for "Overdue" (null: don't flag). */
  today?: string | null;
  /** Execute & Monitor: change a milestone's owner and deadline. */
  editStep?: (period: string, index: number, owner: string, due: string | null) => Promise<Result>;
  /** The plan's targets with the company's current figures; `save` when they can be edited. */
  targets?: { current: Record<string, number | null>; save?: (targets: PlanTarget[]) => Promise<Result> };
  /** When set, milestones can be moved across the board. */
  move?: (period: string, index: number, status: StepStatus) => Promise<Result>;
  /** Founder, before the plan starts: who does each action. */
  assign?: (period: string, index: number, assignee: "us" | "gg") => Promise<Result>;
  /** Founder, before the plan starts: start it. */
  start?: () => Promise<Result>;
}) {
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<StepStatus | null>(null);
  // Moves and choices show straight away; the server confirms (or they revert with an error).
  const [moved, setMoved] = useState<Record<string, StepStatus>>({});
  const [chosen, setChosen] = useState<Record<string, "us" | "gg">>({});
  const router = useRouter();
  const started = Boolean(content.startedAt);
  const choosing = Boolean(assign && start && !started);
  const canMove = Boolean(move && (started || !start));

  const steps = allSteps(content).map((s) => {
    const key = `${s.period}:${s.index}`;
    return { ...s, key, status: moved[key] ?? stepStatus(s.step), assignee: chosen[key] ?? s.step.assignee };
  });
  const done = steps.filter((s) => s.status === "done").length;
  const gg = steps.filter((s) => s.assignee === "gg").length;

  const call = (fn: () => Promise<Result>, undo: () => void) =>
    run(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? "Couldn't save that.");
        undo();
      }
      router.refresh();
    });
  const moveTo = (s: (typeof steps)[number], status: StepStatus) => {
    if (!move || status === s.status) return;
    const before = s.status;
    setMoved((m) => ({ ...m, [s.key]: status }));
    call(() => move(s.period, s.index, status), () => setMoved((m) => ({ ...m, [s.key]: before })));
  };
  const choose = (s: (typeof steps)[number], who: "us" | "gg") => {
    if (!assign) return;
    const before = s.assignee;
    setChosen((c) => ({ ...c, [s.key]: who }));
    call(() => assign(s.period, s.index, who), () => setChosen((c) => ({ ...c, [s.key]: before ?? "us" })));
  };
  const order: StepStatus[] = BOARD.map((b) => b.id);

  const card = (s: (typeof steps)[number]) => {
    const i = order.indexOf(s.status);
    return (
      <li
        key={s.key}
        draggable={canMove}
        onDragStart={(e) => {
          setDragging(s.key);
          e.dataTransfer.setData("text/plain", s.key);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
        }}
        aria-label={s.step.action}
        className={`rounded-lg p-3 space-y-1.5 ${canMove ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 1px 2px rgba(13,27,42,0.06)", opacity: dragging === s.key ? 0.5 : 1 }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{PERIOD_LABEL[s.period as Period]}</span>
          {s.assignee && !assign && (
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={s.assignee === "gg" ? { background: "var(--green-muted)", color: "var(--green)" } : { background: "var(--blue-muted)", color: "var(--blue)" }}>
              {s.assignee === "gg" ? "Growth Goaled" : "We'll do it"}
            </span>
          )}
        </div>
        <div className="text-sm font-medium" style={{ color: "var(--foreground)", textDecoration: s.status === "done" ? "line-through" : undefined }}>{s.step.action}</div>
        <StepMeta step={s.step as PlanStep} today={today} save={editStep ? (owner, due) => editStep(s.period, s.index, owner, due) : undefined} />
        {assign && (
          <label className="block text-xs pt-1" style={{ color: "var(--muted-foreground)" }}>
            Who takes responsibility
            <select
              aria-label={`Who takes responsibility: ${s.step.action}`}
              value={s.assignee ?? "us"}
              disabled={pending}
              onChange={(e) => choose(s, e.target.value as "us" | "gg")}
              className="field w-full mt-0.5 text-sm py-1"
              style={s.assignee === "gg" ? { borderColor: "var(--green)", color: "var(--green)", fontWeight: 600 } : undefined}
            >
              <option value="us">We&apos;ll do it</option>
              <option value="gg">Assign to Growth Goaled</option>
            </select>
          </label>
        )}
        {canMove && (
          <div className="flex justify-between pt-1">
            {i > 0 ? (
              <button type="button" disabled={pending} onClick={() => moveTo(s, order[i - 1]!)} className="text-xs inline-flex items-center gap-1" style={{ color: "var(--muted-foreground)" }} aria-label={`Move back to ${BOARD[i - 1]!.label}: ${s.step.action}`}>
                <ArrowLeft size={12} aria-hidden /> {BOARD[i - 1]!.label}
              </button>
            ) : (
              <span />
            )}
            {i < order.length - 1 && (
              <button type="button" disabled={pending} onClick={() => moveTo(s, order[i + 1]!)} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "var(--green)" }} aria-label={`Move to ${BOARD[i + 1]!.label}: ${s.step.action}`}>
                {BOARD[i + 1]!.label} <ArrowRight size={12} aria-hidden />
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <HumanPresence variant="plan" />
      <div>
        <div className="label mb-1" style={{ color: "var(--green)" }}>Goal</div>
        <p className="font-display text-2xl leading-tight" style={{ color: "var(--foreground)" }}>{content.goal}</p>
        <p className="text-base mt-2" style={{ color: "var(--muted-foreground)" }}>{content.summary}</p>
        {steps.length > 0 && <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{done} of {steps.length} milestones done</p>}
      </div>

      {choosing && (
        <div role="region" aria-label="Before you start" className="rounded-xl p-4 flex gap-4 items-center flex-wrap" style={{ background: "var(--green-muted)" }}>
          <div className="flex-1 min-w-[16rem]">
            <div className="font-semibold" style={{ color: "var(--foreground)" }}>Before you start: who does each action?</div>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Pick who takes responsibility on each card: &ldquo;We&apos;ll do it&rdquo; or &ldquo;Assign to Growth Goaled&rdquo;. Growth Goaled&apos;s share goes to your advisor to review and quote any extra work.
              {gg > 0 && <strong style={{ color: "var(--foreground)" }}> {gg} assigned to Growth Goaled.</strong>}
            </p>
          </div>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => call(start!, () => {})}>
            Start the plan
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3" role="group" aria-label="Plan board">
        {BOARD.map((col) => {
          const cards = steps.filter((s) => s.status === col.id);
          return (
            <section
              key={col.id}
              aria-label={col.label}
              onDragOver={(e) => {
                if (!canMove) return;
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const key = e.dataTransfer.getData("text/plain");
                const s = steps.find((x) => x.key === key);
                setOver(null);
                if (s) moveTo(s, col.id);
              }}
              className="rounded-xl p-3 min-h-[8rem] transition-colors"
              style={{ background: over === col.id ? "var(--green-muted)" : "var(--muted)", outline: over === col.id ? "2px dashed var(--green)" : undefined }}
            >
              <h4 className="text-sm font-semibold mb-2 flex items-center justify-between" style={{ color: "var(--foreground)" }}>
                {col.label} <span className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>{cards.length}</span>
              </h4>
              <ol className="space-y-2">{cards.map(card)}</ol>
            </section>
          );
        })}
      </div>
      {targets && (targets.save || (content.targets?.length ?? 0) > 0) && <PlanTargets targets={content.targets ?? []} current={targets.current} save={targets.save} />}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
