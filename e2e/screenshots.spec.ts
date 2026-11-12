import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * Not a check: screenshots of every founder page at desktop widths, for layout reviews
 * (docs/screenshots/full-width/<phase>/). Runs only with SCREENSHOTS=<phase>, e.g.
 * `SCREENSHOTS=after npx playwright test e2e/screenshots.spec.ts --trace off`.
 */
const phase = process.env.SCREENSHOTS;
test.skip(!phase, "set SCREENSHOTS=before|after to capture");

const PAGES = ["/overview", "/profile", "/team", "/library", "/performance", "/documents", "/chat", "/whats-next", "PLAN"];

test("founder pages at 1280 and 1440", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('shots@e2e.test','e2e:shots@e2e.test','founder','Sam Shots', now()) on conflict (auth_user_id) do update set name = 'Sam Shots' returning id");
  await db.query("delete from companies where name = 'Shotly'");
  const c = await db.query("insert into companies (name, revenue_band, stage, current_plan) values ('Shotly', '1m_3m', 'Seed', 'Sales Hiring') returning id");
  const company = c.rows[0].id;
  await db.query("delete from company_members where user_id = $1", [u.rows[0].id]);
  await db.query("insert into company_members (company_id, user_id, member_role) values ($1, $2, 'owner')", [company, u.rows[0].id]);
  for (const [metric, value, unit] of [["arr", 2400000, "usd"], ["mom_growth", 4.2, "percent"], ["nrr", 104, "percent"]] as const)
    await db.query("insert into data_points (company_id, metric, value, unit, origin, status, confidence, period) values ($1, $2, $3, $4, 'manual', 'accepted', 'high', '2026-10')", [company, metric, value, unit]);
  const conv = await db.query("insert into conversations (company_id, user_id, topic, title) values ($1, $2, 'hiring', 'Should I hire a second AE?') returning id", [company, u.rows[0].id]);
  const step = (action: string, status: string) => ({ action, owner: "Founder", measure: "Done", status });
  const content = {
    goal: "Hire a second AE who reaches quota by month 4",
    summary: "Prove the motion is repeatable before the hire, then hire against a written profile.",
    startedAt: new Date().toISOString(),
    days30: [step("Write down your last 10 closed deals", "done"), step("Measure founder vs AE conversion", "doing")],
    days60: [step("Write the AE profile and scorecard", "todo"), step("Set quota from ACV and ramp", "todo")],
    days90: [step("Interview and hire", "todo")],
    risks: [],
    assumptions: [],
  };
  await db.query("insert into action_plans (company_id, conversation_id, topic, tier, status, content) values ($1, $2, 'hiring', 'plan', 'delivered', $3)", [company, conv.rows[0].id, JSON.stringify(content)]);
  await db.end();

  const dir = `docs/screenshots/full-width/${phase}`;
  mkdirSync(dir, { recursive: true });
  for (const width of [1280, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addCookies([{ name: "gg_e2e_user", value: "shots@e2e.test", domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    for (const path of PAGES) {
      const url = path === "PLAN" ? `/chat/${conv.rows[0].id}` : path;
      const res = await page.goto(url);
      if (!res || res.status() >= 400) continue;
      await expect(page.locator("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
      const name = path === "PLAN" ? "action-plan" : path.slice(1);
      await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: false });
    }
    await ctx.close();
  }
});
