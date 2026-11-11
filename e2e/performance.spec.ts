import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The founder's Overview leads with the company and its plan; the advisor names the plan and asks
 * for data; Performance shows plan progress and dated business numbers, with the upload area the
 * request links to.
 */
test("advisor names the plan and asks for data; the founder sees progress and dated numbers", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const a = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('perf-cro@e2e.test','e2e:perf-cro@e2e.test','advisor','Ryan CRO', now()) on conflict (auth_user_id) do update set role = 'advisor' returning id");
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('perf@e2e.test','e2e:perf@e2e.test','founder','Pat', now()) on conflict (auth_user_id) do update set name = 'Pat' returning id");
  const c = await db.query("insert into companies (name, revenue_band, stage, advisor_id) values ('Fasten Perf', '1m_3m', 'Seed', $1) returning id", [a.rows[0].id]);
  const company = c.rows[0].id;
  await db.query("insert into company_members (company_id, user_id, member_role) values ($1, $2, 'owner')", [company, u.rows[0].id]);

  const as = async (email: string) => {
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
    return { ctx, page: await ctx.newPage() };
  };

  // Founder: company first in the menu, then team; no plan yet means one big way to start.
  const f = await as("perf@e2e.test");
  await f.page.goto("/overview");
  const menu = f.page.getByRole("navigation", { name: "Menu" }).getByRole("link");
  await expect(menu).toHaveText(["Company profile", "Team", "Overview", "Strategic Decisions", "Performance", "Documents"]);
  await expect(f.page.getByRole("heading", { name: "Fasten Perf", level: 1 })).toBeVisible();
  await expect(f.page.getByText("Add your website to your company profile to show your logo and what you do.")).toBeVisible();
  await expect(f.page.getByRole("link", { name: "Start a new plan with your advisor here" })).toBeVisible();

  // Advisor: names the plan and asks for an update.
  const adv = await as("perf-cro@e2e.test");
  await adv.page.goto(`/advisor/companies/${company}`);
  const planForm = adv.page.getByRole("region", { name: "Current plan" });
  await planForm.getByLabel("Current plan name").fill("Sales Hiring");
  await planForm.getByRole("button", { name: "Save" }).click();
  await expect(planForm.getByLabel("Current plan name")).toHaveValue("Sales Hiring");
  const ask = adv.page.getByRole("region", { name: "Request data" });
  await ask.getByRole("button", { name: "Send request" }).click();
  await expect(ask.getByRole("alert")).toContainText("Say what you need");
  await ask.getByLabel("Retention or churn figures").check();
  await ask.getByLabel("Note for the founder").fill("Before Thursday's review, please");
  await ask.getByRole("button", { name: "Send request" }).click();
  // Test mode sends no email: the advisor is told so.
  await expect(ask.getByRole("status")).toContainText("email didn't go out");
  await expect(ask.getByRole("list", { name: "Data requests" })).toContainText("Waiting");
  await adv.ctx.close();
  const req = await db.query("select id from data_requests where company_id = $1", [company]);

  // Founder: the plan leads the Overview.
  await f.page.reload();
  await expect(f.page.getByRole("region", { name: "Current plan" })).toContainText("Sales Hiring");
  await expect(f.page.getByRole("link", { name: "Start a new plan with your advisor here" })).toHaveCount(0);

  // The email's link: Performance, at the upload area, with what was asked.
  await f.page.goto(`/performance?request=${req.rows[0].id}#upload`);
  const asked = f.page.getByRole("region", { name: "Your advisor asked for an update" });
  await expect(asked).toContainText("Ryan CRO asked for an update");
  await expect(asked).toContainText("Retention or churn figures");
  await expect(asked).toContainText("Before Thursday's review, please");
  await expect(f.page.getByRole("region", { name: "Share new data" })).toBeVisible();
  await expect(f.page.getByRole("button", { name: /Choose files|browse/i }).or(f.page.getByText(/Drop|drag/i).first())).toBeVisible();

  // (i) Action plan progress and (ii) business metrics are always there.
  await expect(f.page.getByRole("heading", { name: "Action plan progress" })).toBeVisible();
  await expect(f.page.getByRole("region", { name: "Current plan" })).toContainText("Sales Hiring");
  for (const name of ["Revenue", "Month-over-month growth", "Retention"]) await expect(f.page.getByLabel(name, { exact: true })).toContainText("No figure yet");

  // Two months typed in: revenue, growth worked out, retention; each update dated.
  const form = f.page.getByRole("form", { name: "Add an update" });
  await form.getByLabel("Month", { exact: true }).fill("2026-09");
  await form.getByLabel("Monthly revenue ($)").fill("80,000");
  await form.getByRole("button", { name: "Add update" }).click();
  await expect(form.getByRole("status")).toBeVisible();
  await form.getByLabel("Month", { exact: true }).fill("2026-10");
  await form.getByLabel("Monthly revenue ($)").fill("86000");
  await form.getByLabel("Net revenue retention (%)").fill("104");
  await form.getByRole("button", { name: "Add update" }).click();
  await expect(f.page.getByLabel("Revenue", { exact: true })).toContainText("about $86K a month", { timeout: 10_000 });
  await expect(f.page.getByLabel("Revenue", { exact: true })).toContainText("Was $960K");
  await expect(f.page.getByLabel("Month-over-month growth", { exact: true })).toContainText("7.5%");
  await expect(f.page.getByLabel("Retention", { exact: true })).toContainText("104%");
  await expect(f.page.getByRole("list", { name: "Update history" }).getByRole("listitem").first()).toContainText("Entered by hand");

  // The advisor clears the latest update; the founder sees the one before it again.
  const adv2 = await as("perf-cro@e2e.test");
  await adv2.page.goto(`/advisor/companies/${company}`);
  const updates = adv2.page.getByRole("list", { name: "Business updates" });
  await expect(updates.getByRole("listitem")).toHaveCount(2);
  await updates.getByRole("button", { name: /^Remove the update from/ }).first().click();
  await expect(updates.getByRole("listitem")).toHaveCount(1);
  await adv2.ctx.close();
  await f.page.reload();
  await expect(f.page.getByLabel("Revenue", { exact: true })).toContainText("about $80K a month");
  await expect(f.page.getByLabel("Retention", { exact: true })).toContainText("No figure yet");
  await db.end();
  await f.ctx.close();
});
