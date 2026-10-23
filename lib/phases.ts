import type { Company } from "@/lib/db/schema";

type Phase = Company["phase"];

/** Founder sidebar steps, numbered as in the prototype. */
export const FOUNDER_NAV = [
  { href: "/dashboard", label: "Overview", step: 0 },
  { href: "/intake", match: "/intake", label: "Company Profile", step: 1 },
  { href: "/readiness", label: "Data Readiness", step: 2 },
  { href: "/benchmark", label: "Benchmark", step: 3 },
  { href: "/baseline", label: "Baseline", step: 4 },
  { href: "/icp", label: "ICP", step: 5 },
  { href: "/channels", label: "Channel Strategy", step: 6 },
  { href: "/hiring", label: "Hiring Plan", step: 7 },
  { href: "/questions", label: "Questions", step: 8 },
  { href: "/deliverables", label: "Deliverables", step: 9 },
] as const;

const PHASE_STEP: Record<Phase, number> = {
  intake: 1,
  upload: 2,
  benchmark: 3,
  baseline: 4,
  icp: 5,
  channels: 6,
  hiring: 7,
  complete: Number.POSITIVE_INFINITY,
};

/** Sidebar step that is currently active for a company phase. */
export const currentStep = (phase: Phase) => PHASE_STEP[phase];

export const PROGRESS_PHASES = ["Profile", "Benchmark", "Baseline", "ICP", "Channels", "Hiring"] as const;

/** Index into PROGRESS_PHASES (PROGRESS_PHASES.length when complete). */
export function progressIndex(phase: Phase): number {
  switch (phase) {
    case "intake":
    case "upload":
      return 0;
    case "benchmark":
      return 1;
    case "baseline":
      return 2;
    case "icp":
      return 3;
    case "channels":
      return 4;
    case "hiring":
      return 5;
    case "complete":
      return PROGRESS_PHASES.length;
  }
}
