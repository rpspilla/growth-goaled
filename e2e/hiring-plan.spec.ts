import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";
import { HIRING_INPUTS } from "../lib/hiring-plan";

/**
 * The Growth Hiring Plan: exactly six founder inputs (pre-filled from confirmed figures, ramp shown
 * as a default), the advisor's approval before it goes live, then the quota and pipeline worked out
 * in code with the Source Trail.
 */
test("a founder answers the six hiring inputs; the advisor approves; the hiring numbers follow", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('hire-admin@e2e.test','e2e:hire-admin@e2e.test','admin','Ari Admin', now()) on conflict (auth_user_id) do update set role = 'admin'");
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('hire@e2e.test','e2e:hire@e2e.test','founder','Hana', now()) on conflict (auth_user_id) do update set name = 'Hana' returning id");
  await db.query("delete from companies where name = 'Hireco'");
  const c = await db.query("insert into companies (name, revenue_band, stage) values ('Hireco', '1m_3m', 'Seed') returning id");
  const company = c.rows[0].id;
  await db.query("delete from company_members where user_id = $1", [u.rows[0].id]);
  await db.query("insert into company_members (company_id, user_id, member_role) values ($1, $2, 'owner')", [company, u.rows[0].id]);
  const cu = await db.query("insert into company_use_cases (company_id, use_case, status, activated_at, activation) values ($1, 'hire_or_fix', 'tracking', now(), 'advisor') returning id", [company]);
  const content = { useCase: "hire_or_fix", figures: [], reference: null, summary: { headline: "Hire one AE once the motion transfers", body: "", claimKey: "summary" }, findings: [], diagnosis: { text: "d", claimKey: "diagnosis" }, decision: { text: "Hire one AE", claimKey: "decision" }, actions: [], assumptions: [], dataGaps: [], nextSteps: [], methodology: "m" };
  const d = await db.query("insert into deliverables (company_id, type, use_case, status, content, code_checks_passed) values ($1, 'baseline', 'hire_or_fix', 'published', $2, true) returning id", [company, JSON.stringify(content)]);
  for (const [n, i] of HIRING_INPUTS.entries())
    await db.query("insert into plan_actions (company_id, company_use_case_id, deliverable_id, priority, action, timing, success_metric, assignee, request) values ($1,$2,$3,$4,$5,$6,$7,'founder',$8)", [company, cu.rows[0].id, d.rows[0].id, n + 1, i.action, i.timing, i.title, JSON.stringify(i.request)]);
  await db.query("insert into plan_actions (company_id, company_use_case_id, deliverable_id, priority, action, timing, assignee) values ($1,$2,$3,7,'Draft the AE hiring profile','days_61_90','growth_goaled')", [company, cu.rows[0].id, d.rows[0].id]);
  for (const [metric, value, unit] of [["arr", 1800000, "usd"], ["acv", 40000, "usd"]] as const)
    await db.query("insert into data_points (company_id, metric, value, unit, origin, status, confidence, period) values ($1, $2, $3, $4, 'manual', 'accepted', 'high', '2026-10')", [company, metric, value, unit]);
  await db.end();

  const as = async (email: string) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
    return { ctx, page: await ctx.newPage() };
  };
  const f = await as("hire@e2e.test");
  await f.page.goto("/progress");
  // Waiting for the advisor: the inputs are open meanwhile; Growth Goaled's task isn't shown.
  await expect(f.page.getByRole("status").filter({ hasText: "Your advisor is reviewing your plan." })).toBeVisible();
  await expect(f.page.getByTestId("founder-input")).toHaveCount(6);
  await expect(f.page.getByText("Draft the AE hiring profile")).toHaveCount(0);

  const answer = async (action: string, values: Record<string, string>, expectFilled?: Record<string, string>) => {
    await f.page.getByRole("button", { name: `Answer: ${action}` }).click();
    const form = f.page.getByRole("form", { name: `Answer: ${action}` });
    for (const [label, v] of Object.entries(expectFilled ?? {})) await expect(form.getByLabel(label, { exact: false })).toHaveValue(v);
    for (const [label, v] of Object.entries(values)) await form.getByLabel(label, { exact: false }).fill(v);
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form).toHaveCount(0);
  };
  const [conversion, cycle, acv, ramp, churn, target] = HIRING_INPUTS.map((i) => i.action);
  await answer(conversion!, { "Conversion rate, founder-owned deals": "35", "Conversion rate, AE-owned deals": "25" });
  await answer(cycle!, { "Average deal cycle, founder-closed": "45", "Average deal cycle, AE-closed": "60" });
  // ACV is pre-filled from the confirmed figure; ramp shows 90 days as a default.
  await f.page.getByRole("button", { name: `Answer: ${acv}` }).click();
  await expect(f.page.getByText("Filled in from your data.")).toBeVisible();
  await f.page.getByRole("form", { name: `Answer: ${acv}` }).getByRole("button", { name: "Save" }).click();
  await f.page.getByRole("button", { name: `Answer: ${ramp}` }).click();
  await expect(f.page.getByText("Default for mid-market: 90 days.")).toBeVisible();
  await f.page.getByRole("form", { name: `Answer: ${ramp}` }).getByRole("button", { name: "Save" }).click();
  await answer(churn!, { "Gross revenue churn, last 12 months": "8" });
  await answer(target!, { "Revenue target (ARR)": "3000000", "Target date": "2027-11-12" });
  await expect(f.page.getByRole("button", { name: /^Change your answer:/ })).toHaveCount(6);

  // The advisor approves it from the Review Queue.
  const a = await as("hire-admin@e2e.test");
  await a.page.goto("/advisor/review");
  await a.page.getByRole("link", { name: /Hireco.*Growth project plan/ }).click();
  await expect(a.page.getByRole("region", { name: "Hiring plan numbers" })).toContainText("Quota recommendation");
  await a.page.getByRole("button", { name: "Approve the plan" }).click();
  await expect(a.page.getByText(/Plan approved .*: live for the founder/)).toBeVisible();

  // Live: the numbers, with every formula and input in the Source Trail; the target is "your target".
  await f.page.reload();
  const numbers = f.page.getByRole("region", { name: "Hiring plan numbers" });
  await expect(numbers).toContainText("Quota recommendation for the new AE");
  await expect(numbers).toContainText(/\$[\d,]+ a year/);
  await expect(numbers).toContainText("Pipeline needed per month");
  await expect(numbers).toContainText("4x");
  await expect(numbers.getByRole("alert")).toHaveCount(0);
  await numbers.getByText("Source Trail: how these are worked out").click();
  await expect(numbers.getByRole("list", { name: "Source Trail" })).toContainText("Revenue target (ARR): $3,000,000 · Your target");
  await expect(numbers.getByRole("list", { name: "Source Trail" })).toContainText("Monthly quota × pipeline coverage");
  await f.ctx.close();
  await a.ctx.close();
});
