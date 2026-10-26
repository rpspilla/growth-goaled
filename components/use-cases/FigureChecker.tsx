"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FigureChoice } from "@/lib/figures";

type Result = { ok: true } | { ok: false; error: string };

const BADGE: Record<FigureChoice["state"], { label: string; color: string; bg: string }> = {
  conflict: { label: "Values disagree", color: "var(--red)", bg: "var(--red-muted, #FDECEC)" },
  unconfirmed: { label: "Not confirmed", color: "var(--amber)", bg: "var(--amber-muted)" },
  missing: { label: "Missing", color: "var(--muted-foreground)", bg: "var(--muted)" },
  agreed: { label: "Confirmed", color: "var(--green)", bg: "var(--green-muted)" },
};

function Row({ f, choose, enter, onChanged }: { f: FigureChoice; choose: (m: string, id: string) => Promise<Result>; enter: (m: string, raw: string) => Promise<Result>; onChanged: () => void }) {
  const [typing, setTyping] = useState(f.state === "missing");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) {
        setTyping(false);
        setRaw("");
        onChanged();
      } else setError(r.error);
    });
  const badge = BADGE[f.state];
  const inputId = `figure-${f.metric}`;

  return (
    <li className="py-4 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{f.label}</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
      </div>

      {f.candidates.length > 0 && (
        <fieldset disabled={pending}>
          <legend className="sr-only">Which {f.label} should the assessment use?</legend>
          <ul className="space-y-1.5">
            {f.candidates.map((c) => {
              const inUse = c.id === f.inUseId;
              return (
                <li key={c.id} className="flex items-center gap-3 flex-wrap text-sm">
                  <span className="font-mono font-semibold w-24" style={{ color: "var(--foreground)" }}>{c.formatted}</span>
                  <span className="flex-1 min-w-40" style={{ color: "var(--muted-foreground)" }}>
                    {c.source}
                    {c.period && c.period !== "Current" ? ` · ${c.period}` : ""}
                    {c.status === "proposed" ? " · not confirmed" : ""}
                  </span>
                  {f.state === "agreed" ? (
                    <span className="text-xs font-medium" style={{ color: "var(--green)" }}>{inUse ? "In use" : "Matches"}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => run(() => choose(f.metric, c.id))}
                      className="text-xs px-2.5 py-1 rounded-md font-semibold"
                      style={{ background: "var(--green)", color: "#fff" }}
                      aria-label={`Use ${c.formatted} from ${c.source} for ${f.label}`}
                    >
                      {f.state === "unconfirmed" ? "Confirm" : "Use this one"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {typing ? (
        <form
          className="flex items-center gap-2 flex-wrap mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => enter(f.metric, raw));
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            {f.label} {f.unitHint}
          </label>
          <input
            id={inputId}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={`${f.label}, ${f.unitHint}`}
            inputMode="decimal"
            className="w-56 rounded-md border px-2.5 py-1.5 text-sm"
            style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
          />
          <button type="submit" disabled={pending || !raw.trim()} className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-50" style={{ background: "var(--green)", color: "#fff" }}>
            {pending ? "Saving…" : "Save"}
          </button>
          {f.state !== "missing" && (
            <button type="button" onClick={() => setTyping(false)} className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Cancel
            </button>
          )}
        </form>
      ) : (
        <button type="button" onClick={() => setTyping(true)} className="text-xs mt-2" style={{ color: "var(--green)" }}>
          {f.candidates.length ? "Enter a different figure" : "Enter it"}
        </button>
      )}
      {error && <p className="text-xs mt-1" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    </li>
  );
}

/**
 * "Check your figures": every figure the assessment relies on, where each value came from,
 * and a one-click choice when the profile and files disagree, or a box to enter a missing one.
 * Open by default whenever something needs attention.
 */
export function FigureChecker({
  choices,
  choose,
  enter,
  rerun,
}: {
  choices: FigureChoice[];
  choose: (metric: string, dataPointId: string) => Promise<Result>;
  enter: (metric: string, raw: string) => Promise<Result>;
  /** Shown after a change, e.g. a "Re-run with these figures" button. */
  rerun?: React.ReactNode;
}) {
  const router = useRouter();
  const [changed, setChanged] = useState(false);
  const issues = choices.filter((c) => c.state !== "agreed");
  const conflicts = choices.filter((c) => c.state === "conflict").length;
  const order = { conflict: 0, unconfirmed: 1, missing: 2, agreed: 3 } as const;
  const sorted = [...choices].sort((a, b) => order[a.state] - order[b.state]);

  return (
    <details open={issues.length > 0} className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: conflicts ? "var(--red)" : issues.length ? "var(--amber)" : "var(--border)" }}>
      <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--foreground)" }}>
        Check your figures
        <span className="font-normal" style={{ color: "var(--muted-foreground)" }}>
          {" "}
          ·{" "}
          {issues.length
            ? `${conflicts ? `${conflicts} ${conflicts === 1 ? "disagrees" : "disagree"}` : ""}${conflicts && issues.length > conflicts ? ", " : ""}${issues.length > conflicts ? `${issues.length - conflicts} to confirm or add` : ""}`
            : "all confirmed"}
        </span>
      </summary>
      <p className="text-xs mt-2 mb-1" style={{ color: "var(--muted-foreground)" }}>
        These are the figures this assessment uses. Where your company profile and your files disagree, choose the right one; add any that are missing. Your choice updates your profile too.
      </p>
      {changed && (
        <div className="rounded-lg p-3 my-2 text-sm flex items-center gap-3 flex-wrap" role="status" style={{ background: "var(--green-muted)", color: "var(--foreground)" }}>
          <span className="flex-1">Figures updated. Re-run the assessment to use them.</span>
          {rerun}
        </div>
      )}
      <ul>
        {sorted.map((f) => (
          <Row
            key={f.metric}
            f={f}
            choose={choose}
            enter={enter}
            onChanged={() => {
              setChanged(true);
              router.refresh();
            }}
          />
        ))}
      </ul>
    </details>
  );
}
