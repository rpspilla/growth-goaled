"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Circle, CircleDot, type LucideIcon } from "lucide-react";
import { ExpandableDetail } from "@/components/visual/primitives";
import type { ProgressView } from "@/lib/data/plan";
import { answerLine } from "@/lib/plan-requests";
import { RequestAnswer, type FileRef } from "@/components/chat/RequestAnswer";

type Result = { ok: true } | { ok: false; error: string };
type Action = ProgressView["actions"][number];
type Status = Action["status"];

const STATUS_LABEL: Record<Status, string> = { not_started: "Not started", in_progress: "In progress", done: "Done", dropped: "Dropped" };
const TIMING: Record<string, string> = { next_30_days: "Days 1–30", days_31_60: "Days 31–60", days_61_90: "Days 61–90" };
const COLUMNS: { status: Status; icon: LucideIcon; color: string }[] = [
  { status: "not_started", icon: Circle, color: "var(--muted-foreground)" },
  { status: "in_progress", icon: CircleDot, color: "var(--amber)" },
  { status: "done", icon: CheckCircle2, color: "var(--green)" },
];

const WHO: Record<Action["assignee"], string> = { founder: "Founder", growth_goaled: "Growth Goaled" };

/** The founder answers an input: typed values, or a file uploaded under `blobPrefix`. */
type Answers = { blobPrefix: string; type: (id: string, values: Record<string, string>) => Promise<Result>; file: (id: string, file: FileRef) => Promise<Result>; /** Figures already on file, by field key. */ prefill?: Record<string, string> };

function ActionCard({ a, update, answers }: { a: Action; update: (id: string, status: string, note: string | null) => Promise<Result>; answers?: Answers }) {
  const [note, setNote] = useState(a.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = (status: string, n: string | null) =>
    start(async () => {
      setError(null);
      const r = await update(a.id, status, n);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  const m = a.metric;
  const control = { background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" };
  const tone = m?.direction === "better" ? "var(--green)" : m?.direction === "worse" ? "var(--red)" : "var(--foreground)";
  return (
    <li className="rounded-xl p-3.5 space-y-2.5" style={{ background: "var(--card)", border: `1px solid ${a.status === "done" ? "var(--green)" : "var(--border)"}`, opacity: pending ? 0.6 : 1 }}>
      <div className="text-sm font-semibold" style={{ color: "var(--foreground)", textDecoration: a.status === "dropped" ? "line-through" : undefined }}>
        {a.action}
      </div>
      <div className="flex flex-wrap gap-1.5" data-label>
        {(m || a.successMetric) && (
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--green-muted)", color: "var(--green)" }} title={a.successMetric ?? undefined}>
            KPI · {m?.label ?? (a.successMetric!.length > 26 ? `${a.successMetric!.slice(0, 24)}…` : a.successMetric)}
          </span>
        )}
        {!answers && (
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={a.assignee === "growth_goaled" ? { background: "var(--green-muted)", color: "var(--green)" } : { background: "var(--blue-muted)", color: "var(--blue)" }}>
            {WHO[a.assignee]}
          </span>
        )}
        {a.timing && (
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
            {TIMING[a.timing] ?? a.timing}
          </span>
        )}
      </div>
      {m && (
        <div className="flex items-baseline gap-1.5 text-xs font-mono" data-label>
          <span style={{ color: "var(--muted-foreground)" }}>{m.baseline ?? "—"}</span>
          <span aria-hidden style={{ color: "var(--muted-foreground)" }}>→</span>
          <span className="font-semibold" style={{ color: tone }}>{m.latest ?? "no new figure"}</span>
        </div>
      )}
      {a.request &&
        (answers ? (
          <RequestAnswer
            action={a.action}
            request={a.request}
            blobPrefix={answers.blobPrefix}
            prefill={answers.prefill}
            answer={async (values) => {
              const r = await answers.type(a.id, values);
              router.refresh();
              return r.ok ? r : { ok: false, error: r.error };
            }}
            answerFile={async (file) => {
              const r = await answers.file(a.id, file);
              router.refresh();
              return r.ok ? r : { ok: false, error: r.error };
            }}
          />
        ) : (
          <p className="text-xs" style={{ color: a.request.answer ? "var(--green)" : "var(--muted-foreground)" }}>
            {a.request.answer ? `Answered: ${answerLine(a.request)}` : `Asks for: ${a.request.fields.map((f) => f.label).join(" · ")}`}
          </p>
        ))}
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`status-${a.id}`}>
          Status
        </label>
        <select id={`status-${a.id}`} value={a.status} disabled={pending} onChange={(e) => save(e.target.value, note || null)} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold" style={control}>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {a.note && (
          <span className="text-xs truncate" style={{ color: "var(--muted-foreground)" }} title={a.note}>
            “{a.note}”
          </span>
        )}
      </div>
      <ExpandableDetail summary="Details and note">
        {a.rationale && <p>{a.rationale}</p>}
        {a.successMetric && (
          <p>
            <span className="font-semibold" style={{ color: "var(--foreground)" }}>Measure: </span>
            {a.successMetric}
          </p>
        )}
        {a.expectedSignal && (
          <p>
            <span className="font-semibold" style={{ color: "var(--foreground)" }}>Signal to look for: </span>
            {a.expectedSignal} <span className="italic">(proposed)</span>
          </p>
        )}
        <label className="sr-only" htmlFor={`note-${a.id}`}>
          Note
        </label>
        <input
          id={`note-${a.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (a.note ?? "") && save(a.status, note || null)}
          placeholder="Add a note (saved when you click away)"
          className="w-full rounded-lg border px-2.5 py-1.5 text-sm"
          style={control}
        />
      </ExpandableDetail>
      {error && (
        <p className="text-xs" role="alert" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
    </li>
  );
}

/** The committed plan as a board: Not started / In progress / Done, with dropped actions behind a toggle. */
export function PlanTracker({ actions, update, answers }: { actions: Action[]; update: (id: string, status: string, note: string | null) => Promise<Result>; /** Founder: answer each input (founder items only are passed in). */ answers?: Answers }) {
  const dropped = actions.filter((a) => a.status === "dropped");
  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        {COLUMNS.map((c) => {
          const here = actions.filter((a) => a.status === c.status);
          const Icon = c.icon;
          return (
            <section key={c.status} className="rounded-xl p-3 space-y-2.5" style={{ background: "var(--muted)" }} aria-label={`${STATUS_LABEL[c.status]}: ${here.length}`}>
              <div className="flex items-center gap-1.5 px-0.5">
                <Icon size={16} style={{ color: c.color }} aria-hidden />
                <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                  {STATUS_LABEL[c.status]}
                </h3>
                <span className="text-xs font-mono ml-auto" style={{ color: "var(--subtle-foreground)" }}>
                  {here.length}
                </span>
              </div>
              {here.length ? (
                <ul className="space-y-2.5">
                  {here.map((a) => (
                    <ActionCard key={a.id} a={a} update={update} answers={answers} />
                  ))}
                </ul>
              ) : (
                <p data-label className="text-xs px-0.5 py-3 text-center rounded-lg border border-dashed" style={{ color: "var(--subtle-foreground)", borderColor: "var(--border)" }}>
                  None
                </p>
              )}
            </section>
          );
        })}
      </div>
      {dropped.length > 0 && (
        <ExpandableDetail summary={`Dropped · ${dropped.length}`}>
          <ul className="grid md:grid-cols-3 gap-3">
            {dropped.map((a) => (
              <ActionCard key={a.id} a={a} update={update} answers={answers} />
            ))}
          </ul>
        </ExpandableDetail>
      )}
    </div>
  );
}
