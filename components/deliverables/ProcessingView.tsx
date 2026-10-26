"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export type FounderStatus = "none" | "drafting" | "qa" | "in_review" | "changes_requested" | "approved" | "published" | "failed" | "stalled";

const STEPS = ["Company data gathered", "Benchmark cohort matched", "Draft written from your data", "Independent quality check", "Advisor review", "Published to you"];

/** How far along each status is; founders see progress only, never draft content. */
function progress(status: FounderStatus): number {
  switch (status) {
    case "drafting":
      return 2;
    case "qa":
      return 3;
    case "in_review":
    case "changes_requested":
    case "approved":
    case "failed":
    case "stalled":
      return 4;
    case "published":
      return 6;
    default:
      return 0;
  }
}

export function ProcessingView({ status, hasPublished }: { status: FounderStatus; hasPublished: boolean }) {
  const router = useRouter();
  const working = status === "drafting" || status === "qa";
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [working, router]);
  const done = progress(status);

  const message =
    status === "none"
      ? "Your benchmark hasn't started yet. It begins when you send your data to your advisor from Data Readiness."
      : status === "drafting"
        ? "Comparing your figures with the matched cohort..."
        : status === "qa"
          ? "Checking every figure against your data and the benchmark sources..."
          : status === "published"
            ? "Your benchmark is ready."
            : "Your advisor is reviewing your benchmark. You'll see it here as soon as they publish it.";

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-8 py-16" style={{ background: "var(--navy)" }}>
      <div className="w-full max-w-md text-center">
        <h2 className="font-display text-2xl font-normal mb-2" style={{ color: "#fff" }}>Building your benchmark</h2>
        <p className="text-sm mb-8" style={{ color: "#7A98B4" }} role="status">{message}</p>
        <div className="space-y-3 text-left">
          {STEPS.map((label, i) => {
            const complete = i < done;
            const active = i === done && status !== "none" && status !== "published";
            return (
              <div key={label} className="flex items-center gap-3" style={{ opacity: complete || active ? 1 : 0.3 }}>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: complete ? "var(--green)" : active ? "rgba(21,90,60,0.4)" : "rgba(255,255,255,0.06)" }}
                >
                  {complete ? (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                      <path d="M1.5 4L3 5.5L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : active ? (
                    <div className={`w-1.5 h-1.5 rounded-full ${working ? "animate-pulse" : ""}`} style={{ background: "#6EE7A8" }} />
                  ) : null}
                </div>
                <span className="text-sm" style={{ color: complete ? "#E2EAF4" : active ? "#6EE7A8" : "#5A7A96" }}>{label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-8 h-1 rounded-full overflow-hidden" style={{ background: "#1E3347" }}>
          <div className="h-1 rounded-full transition-all" style={{ width: `${(done / STEPS.length) * 100}%`, background: "var(--green)" }} />
        </div>
        <div className="mt-8 flex justify-center gap-3">
          {(status === "published" || hasPublished) && (
            <Link href="/baseline" className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>
              {status === "published" ? "View your benchmark →" : "View your current benchmark →"}
            </Link>
          )}
          <Link href="/overview" className="px-4 py-2 rounded-lg text-sm" style={{ color: "#7A98B4" }}>Back to overview</Link>
        </div>
      </div>
    </div>
  );
}
