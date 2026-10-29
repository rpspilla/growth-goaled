"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mic, Play, RefreshCw } from "lucide-react";
import { ExpandableDetail, ProgressRing } from "@/components/visual/primitives";
import { requestAssessment } from "@/app/(founder)/data/actions";

export type AssessmentState = "not_started" | "building" | "ready" | "failed";

/**
 * The run / re-run control at the top of every Data page: a readiness ring, a sales-call meter
 * (the advisor-review rule in one line) and one big button. The report is never blocked on
 * missing data; what running now means sits behind "What happens when I run it?".
 */
export function BaselineMeter({
  done,
  total,
  ready,
  assessment,
  calls,
}: {
  done: number;
  total: number;
  ready: boolean;
  assessment: AssessmentState;
  /** Recorded sales calls shared, and how many the question expects (optional: reports never wait for them). */
  calls?: { count: number; needed: number };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const label = assessment === "ready" ? "Re-run my report" : assessment === "failed" ? "Run my report again" : "Run my report";
  const enoughCalls = !calls || calls.count >= calls.needed;
  const run = () =>
    start(async () => {
      setError(null);
      const r = await requestAssessment();
      if (r.ok) router.push("/baseline");
      else setError(r.error);
    });

  return (
    <section className="surface p-5" style={{ borderColor: "var(--green)", boxShadow: "0 0 0 1px var(--green)" }} aria-labelledby="run-report">
      <h2 id="run-report" className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
        {assessment === "ready" ? "Your report" : "Run your report"}
      </h2>
      <div className="flex items-center gap-4 mt-3">
        <div role="meter" aria-label="Ready for analysis" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <ProgressRing value={total ? done / total : 0} label="Ready" size={84} tone={ready ? "green" : "amber"} />
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            {ready ? "Ready: everything the assessment needs is in." : `${done} of ${total} required items in`}
          </p>
          {calls && (
            <div>
              <div className="flex items-center gap-1" aria-hidden>
                {Array.from({ length: calls.needed }, (_, i) => (
                  <span key={i} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: i < calls.count ? "var(--green)" : "var(--muted)", color: i < calls.count ? "#fff" : "var(--subtle-foreground)" }}>
                    <Mic size={14} />
                  </span>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: enoughCalls ? "var(--green)" : "var(--muted-foreground)" }}>
                <span className="font-semibold">Recorded sales calls: {calls.count} of {calls.needed}.</span> {enoughCalls ? "Sales call review included." : "Optional · your advisor may ask for them."}
              </p>
            </div>
          )}
        </div>
      </div>


      <div className="mt-4">
        {assessment === "building" ? (
          <Link href="/baseline" className="btn btn-primary btn-lg w-full">
            Your report is being built · see progress →
          </Link>
        ) : (
          <button type="button" disabled={pending} onClick={run} className="btn btn-primary btn-lg w-full text-lg" style={{ minHeight: "3.5rem" }}>
            {assessment === "ready" ? <RefreshCw size={18} aria-hidden /> : <Play size={18} aria-hidden />}
            {pending ? "Starting your report…" : label}
          </button>
        )}
        {assessment === "ready" && (
          <Link href="/baseline" className="btn btn-secondary w-full mt-3">
            View your latest results →
          </Link>
        )}
      </div>
      {error && (
        <p className="text-sm mt-2" role="alert" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
      <div className="mt-3">
        <ExpandableDetail summary="What happens when I run it?">
          <p>
            {assessment === "ready"
              ? "Re-running builds a new version from everything you've shared, and keeps the previous one."
              : ready
                ? "Takes a few minutes. You'll see your results as soon as they're ready."
                : "You can run it now: the report goes as far as your data allows and lists what's missing. Adding the required items makes it sharper."}
          </p>
          {calls && !enoughCalls && <p>Your report doesn&apos;t wait for recorded sales calls. With {calls.needed} or more, it also reviews how your sales process runs on real calls; your advisor will ask for them if they aren&apos;t here.</p>}
        </ExpandableDetail>
      </div>
    </section>
  );
}
