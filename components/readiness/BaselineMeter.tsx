"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mic, Play, RefreshCw } from "lucide-react";
import { ExpandableDetail, ProgressRing } from "@/components/visual/primitives";
import { requestAssessment } from "@/app/(founder)/data/actions";

export type AssessmentState = "not_started" | "building" | "ready" | "failed" | "in_review";

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
  /** Recorded sales calls shared, and how many publish the report without an advisor's review. */
  calls?: { count: number; needed: number };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const label = assessment === "ready" || assessment === "in_review" ? "Re-run my report" : assessment === "failed" ? "Run my report again" : "Run my report";
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
              <p className="text-xs mt-1" style={{ color: enoughCalls ? "var(--green)" : "#92400E" }}>
                <span className="font-semibold">Recorded sales calls: {calls.count} of {calls.needed}.</span> {enoughCalls ? "Publishes straight away." : "Fewer means advisor review first."}
              </p>
            </div>
          )}
        </div>
      </div>

      {assessment === "in_review" && (
        <p className="mt-3 text-xs font-semibold rounded-md px-2.5 py-1.5" style={{ background: "var(--blue-muted)", color: "var(--blue)" }}>
          Latest report: with an advisor for review
        </p>
      )}

      <div className="mt-4">
        {assessment === "building" ? (
          <Link href="/baseline" className="btn btn-primary btn-lg w-full">
            Your report is being built · see progress →
          </Link>
        ) : (
          <button type="button" disabled={pending} onClick={run} className="btn btn-primary btn-lg w-full text-lg" style={{ minHeight: "3.5rem" }}>
            {assessment === "ready" || assessment === "in_review" ? <RefreshCw size={18} aria-hidden /> : <Play size={18} aria-hidden />}
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
          {calls && !enoughCalls && <p>With fewer than {calls.needed} recorded calls, an advisor reviews your report before you see it. Upload call recordings or transcripts to skip the wait.</p>}
          {assessment === "in_review" && <p>Your latest report is with an advisor for review. You&apos;ll see it as soon as they&apos;ve reviewed it.</p>}
        </ExpandableDetail>
      </div>
    </section>
  );
}
