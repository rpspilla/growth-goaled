import type { MetricKey } from "@/lib/metrics";

/** A metric calculated in code from the founder's rows, with how and from what. */
export type CalculatedMetric = {
  metric: MetricKey;
  value: number;
  /** Reporting period, e.g. "Sep 2026" or "Oct 2025 – Sep 2026". */
  period: string;
  /** The calculation, in plain words. */
  method: string;
  source: { sheet: string; rows: number; columns: string[] };
  /** Records behind the figure (customers, closed deals…), when it matters for reliability. */
  sampleSize?: number;
};

export type RevenueBridge = {
  from: string;
  to: string;
  startArr: number;
  newArr: number;
  expansionArr: number;
  contractionArr: number;
  churnedArr: number;
  endArr: number;
  customersStart: number;
  customersEnd: number;
  customersNew: number;
  customersChurned: number;
};

export type SegmentRow = { name: string; won: number; lost: number; open: number; winRate: number | null; avgWonAmount: number | null; medianCycleDays: number | null; smallSample: boolean };

/** Structured evidence from one file, kept alongside the figures so diagnoses can cite it. */
export type FileAnalysis = {
  metrics: CalculatedMetric[];
  /** Monthly recurring revenue by month, when a revenue table was found. */
  monthly?: { month: string; mrr: number }[];
  bridge?: RevenueBridge;
  topCustomers?: { name: string; arr: number; share: number }[];
  segments?: { dimension: string; rows: SegmentRow[] }[];
  pipeline?: { openCount: number; openAmount: number; wonCount: number; lostCount: number; asOf: string };
  /** Things we noticed and couldn't use, stated plainly. */
  warnings: string[];
};
