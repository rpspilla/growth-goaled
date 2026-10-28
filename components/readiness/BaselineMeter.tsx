"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestAssessment } from "@/app/(founder)/data/actions";

export type AssessmentState = "not_started" | "building" | "ready" | "failed" | "in_review";

/**
 * The run / re-run control at the top of every Data page: one big, obvious button, how ready the
 * data is, and what running now means. The report is never blocked on missing data.
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
  const percent = total ? Math.round((done / total) * 100) : 0;
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
    <section className="surface p-5 sm:p-6" style={{ borderColor: "var(--green)", boxShadow: "0 0 0 1px var(--green)" }} aria-labelledby="run-report">
      <h2 id="run-report" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
        {assessment === "ready" ? "Your report" : "Run your report"}
      </h2>
      <div className="mt-2 text-base" style={{ color: "var(--foreground)" }}>
        {ready ? "Ready: everything the assessment needs is in." : `${done} of ${total} required items in`}
      </div>
      <div className="h-2 rounded-full mt-2" role="meter" aria-label="Ready for analysis" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} style={{ background: "var(--muted)" }}>
        <div className="h-2 rounded-full transition-all" style={{ width: `${percent}%`, background: ready ? "var(--green)" : "var(--amber)" }} />
      </div>

      {calls && (
        <div className="mt-4 rounded-lg px-3 py-2.5 text-sm" style={{ background: enoughCalls ? "var(--green-muted)" : "var(--amber-muted)", color: "var(--foreground)" }}>
          <span className="font-semibold">Recorded sales calls: {calls.count} of {calls.needed}.</span>{" "}
          {enoughCalls
            ? "Your report publishes as soon as it's ready."
            : `With fewer than ${calls.needed}, an advisor reviews your report before you see it. Upload call recordings or transcripts above to skip the wait.`}
        </div>
      )}
      {assessment === "in_review" && (
        <p className="mt-4 text-sm font-medium" style={{ color: "var(--foreground)" }}>Your latest report is with an advisor for review. You&apos;ll see it as soon as they&apos;ve reviewed it.</p>
      )}

      <div className="mt-5">
        {assessment === "building" ? (
          <Link href="/baseline" className="btn btn-primary btn-lg w-full">Your report is being built · see progress →</Link>
        ) : (
          <button type="button" disabled={pending} onClick={run} className="btn btn-primary btn-lg w-full text-lg" style={{ minHeight: "3.5rem" }}>
            {pending ? "Starting your report…" : label}
          </button>
        )}
        {assessment === "ready" && (
          <Link href="/baseline" className="btn btn-secondary w-full mt-3">View your latest results →</Link>
        )}
      </div>
      <p className="text-sm mt-3" style={{ color: "var(--muted-foreground)" }}>
        {assessment === "ready"
          ? "Re-running builds a new version from everything you've shared, and keeps the previous one."
          : ready
            ? "Takes a few minutes. You'll see your results as soon as they're ready."
            : "You can run it now: the report goes as far as your data allows and lists what's missing. Adding the required items makes it sharper."}
      </p>
      {error && <p className="text-sm mt-2" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    </section>
  );
}
