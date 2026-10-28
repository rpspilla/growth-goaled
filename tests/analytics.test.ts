import { describe, expect, it } from "vitest";
import { computeAnalytics } from "@/lib/analytics";
import { answerKey, INTAKE_SECTIONS } from "@/lib/intake";

const t = (h: number) => new Date(Date.UTC(2026, 9, 1) + h * 3_600_000);
const fullIntake = (companyId: string) =>
  INTAKE_SECTIONS.flatMap((s) => s.fields.filter((f) => f.required).map((f) => ({ companyId, key: answerKey(s.id, f.id), value: "x" })));

describe("computeAnalytics", () => {
  it("computes the derived metrics", () => {
    const a = computeAnalytics({
      companies: [{ id: "a", createdAt: t(0) }, { id: "b", createdAt: t(0) }],
      intake: fullIntake("a"),
      documents: [{ companyId: "a" }, { companyId: "b" }],
      events: [
        { name: "deliverable_published", companyId: "a", createdAt: t(30), props: { type: "benchmark" } },
        { name: "deliverable_published", companyId: "a", createdAt: t(90), props: { type: "benchmark" } },
        { name: "deliverable_viewed", companyId: "a", createdAt: t(31), props: null },
        { name: "deliverable_viewed", companyId: "b", createdAt: t(31), props: null },
        { name: "source_trail_opened", companyId: "a", createdAt: t(32), props: null },
      ],
      reviews: [
        { deliverableId: "d1", companyId: "a", version: 1, decision: "send_back", qaAt: t(10), decidedAt: t(14) },
        { deliverableId: "d2", companyId: "a", version: 2, decision: "approve", qaAt: t(20), decidedAt: t(22) },
        { deliverableId: "d3", companyId: "a", version: 3, decision: "approve", qaAt: t(80), decidedAt: t(86) },
      ],
      published: [
        { id: "d2", companyId: "a", version: 2 },
        { id: "d3", companyId: "a", version: 3 },
      ],
    });
    expect(a.activation).toMatchObject({ value: 50, count: 1 }); // b has a document but no intake
    expect(a.hoursToFirstBenchmark).toMatchObject({ value: 30, count: 1 });
    expect(a.sourceTrailRate).toMatchObject({ value: 50, count: 1 });
    expect(a.reviewTurnaround).toMatchObject({ value: 4, count: 3 }); // median of 4, 2, 6
    expect(a.approvedWithoutChanges).toMatchObject({ value: 50, count: 1 }); // v2 followed a send-back; v3 didn't
  });

  it("returns empty values when there's no data", () => {
    const a = computeAnalytics({ companies: [], intake: [], documents: [], events: [], reviews: [], published: [] });
    expect(a.activation.value).toBeNull();
    expect(a.hoursToFirstBenchmark.value).toBeNull();
  });
});

describe("sign-up funnel", () => {
  it("counts anonymous steps by event and later steps by distinct founder", async () => {
    const { computeFunnel } = await import("@/lib/analytics");
    const e = (name: string, userId: string | null = null, props: Record<string, unknown> | null = null) => ({ name, userId, props });
    const f = computeFunnel([
      e("signup_viewed"), e("signup_viewed"), e("signup_viewed"),
      e("signup_started"), e("signup_started"),
      e("signup_link_sent"),
      e("signup_failed", null, { reason: "invalid_email" }),
      e("welcome_viewed", "u1", { new_company: true }), e("welcome_viewed", "u1", { new_company: true }), e("welcome_viewed", "u2", { new_company: false }),
      e("onboarding_completed", "u1"),
      e("snapshot_viewed", "u1"), e("snapshot_viewed", "u1"),
      e("deliverable_viewed", "u1", { type: "benchmark" }),
    ]);
    const v = Object.fromEntries(f.steps.map((s) => [s.key, s.value]));
    expect(v).toMatchObject({ signup_viewed: 3, signup_started: 2, signup_link_sent: 1, welcome_viewed: 1, onboarding_completed: 1, snapshot_viewed: 1, deliverable_viewed: 0 });
    expect(f).toMatchObject({ failures: 1, reasons: { invalid_email: 1 } });
  });
});
