import { describe, expect, it } from "vitest";
import { acme, benchmark, portfolio, users, SEED_USERS } from "@/lib/seed/data";
import { seedId } from "@/lib/seed/ids";
import { benchmarkContentSchema } from "@/lib/deliverables/benchmark";
import { isMetricKey } from "@/lib/metrics";

const a = acme();
const b = benchmark();
const dpIds = new Map(a.dataPoints.map((d) => [d.id!, d]));
const bmIds = new Map(b.metrics.map((m) => [m.id!, m]));

describe("seedId", () => {
  it("is deterministic and UUID-shaped", () => {
    expect(seedId("x")).toBe(seedId("x"));
    expect(seedId("x")).not.toBe(seedId("y"));
    expect(seedId("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("Acme AI sample", () => {
  it("has valid benchmark content", () => {
    expect(benchmarkContentSchema.safeParse(a.deliverable.content).success).toBe(true);
    expect(a.deliverable.status).toBe("published");
  });

  it("every row points at an accepted data point and an approved benchmark row for the same metric", () => {
    const content = benchmarkContentSchema.parse(a.deliverable.content);
    for (const row of content.rows) {
      const dp = dpIds.get(row.dataPointId);
      const bm = bmIds.get(row.benchmarkMetricId);
      expect(dp?.metric).toBe(row.metric);
      expect(dp?.status).toBe("accepted");
      expect(bm?.metric).toBe(row.metric);
      expect(bm?.status).toBe("approved");
      expect(bm?.cohortId).toBe(content.cohortId);
    }
  });

  it("every claim referenced in content exists and has at least one source", () => {
    const content = benchmarkContentSchema.parse(a.deliverable.content);
    const keys = [
      ...content.rows.map((r) => r.claimKey),
      content.insight.claimKey,
      ...content.summary.strengths.map((s) => s.claimKey),
      ...content.summary.watchAreas.map((s) => s.claimKey),
      content.summary.priority.claimKey,
    ];
    const claimIdByKey = new Map(a.claims.map((c) => [c.claimKey, c.id!]));
    for (const key of keys) {
      const id = claimIdByKey.get(key);
      expect(id, key).toBeDefined();
      expect(a.claimSources.filter((s) => s.claimId === id).length, key).toBeGreaterThan(0);
    }
  });

  it("claim sources resolve to seeded rows", () => {
    for (const s of a.claimSources) {
      if (s.kind === "data_point") expect(dpIds.has(s.refId!)).toBe(true);
      if (s.kind === "benchmark_metric") expect(bmIds.has(s.refId!)).toBe(true);
      if (s.kind === "methodology") expect(s.note).toBeTruthy();
    }
  });

  it("uses dictionary metrics and keeps the sample cohort flagged", () => {
    for (const d of [...a.dataPoints, ...b.metrics]) expect(isMetricKey(d.metric)).toBe(true);
    expect(b.cohort.isSample).toBe(true);
    expect(a.company.isSample).toBe(true);
    expect(a.company.revenueBand).toBe("3m_10m");
  });

  it("review and approvals come from the seeded advisor", () => {
    expect(a.review.reviewerId).toBe(SEED_USERS.advisor);
    expect(users().find((u) => u.id === SEED_USERS.advisor)?.role).toBe("advisor");
  });
});

describe("staging portfolio", () => {
  it("adds six companies, one unassigned, none flagged as the sample", () => {
    const p = portfolio();
    expect(p.companies).toHaveLength(6);
    expect(p.companies.filter((c) => c.advisorId === null)).toHaveLength(1);
    expect(p.companies.every((c) => !c.isSample)).toBe(true);
  });
});
