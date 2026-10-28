import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/** A founder on MULTI_COMPANY_FOUNDERS adds a second company and switches between them; others can't add one. */
test("an allowed founder can run several company profiles, each with its own data", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  for (const email of ["multi@e2e.test", "single@e2e.test"]) {
    const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ($1, $2, 'founder', 'Multi', now()) on conflict (auth_user_id) do update set name = 'Multi' returning id", [email, `e2e:${email}`]);
    const c = await db.query("insert into companies (name, revenue_band) values ($1, '1m_3m') returning id", [email.startsWith("multi") ? "First Co" : "Only Co"]);
    await db.query("insert into company_members (company_id, user_id) values ($1, $2)", [c.rows[0].id, u.rows[0].id]);
  }
  await db.end();

  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: "multi@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto("/overview");
  const switcher = page.getByLabel(/^Company: First Co/);
  await switcher.click();
  await page.getByRole("link", { name: "+ Add a company" }).click();
  await expect(page.getByRole("heading", { name: "Add a company" })).toBeVisible();
  await page.getByLabel("Company name").fill("Second Co");
  await page.getByLabel("Annual revenue").selectOption("3m_10m");
  await page.getByRole("button", { name: "Create company and pick a question" }).click();
  await expect(page).toHaveURL(/\/library\?welcome=1/);
  await expect(page.getByText(/You're set up, Second Co\./)).toBeVisible();

  // Each company keeps its own profile: what's set on one doesn't show on the other.
  await page.goto("/profile/company");
  await expect(page.locator("#intake-name")).toHaveValue("Second Co");
  await page.getByLabel(/^Company: Second Co/).click();
  await page.getByRole("button", { name: "First Co" }).click();
  await expect(page).toHaveURL(/\/overview/);
  await expect(page.getByLabel(/^Company: First Co/)).toBeVisible();
  await page.goto("/profile/company");
  await expect(page.locator("#intake-name")).toHaveValue("First Co");
  await ctx.close();

  // A founder not on the list has one company and no way to add another.
  const single = await browser.newContext();
  await single.addCookies([{ name: "gg_e2e_user", value: "single@e2e.test", domain: "localhost", path: "/" }]);
  const p2 = await single.newPage();
  await p2.goto("/overview");
  await expect(p2.getByRole("banner").getByText("Only Co", { exact: true })).toBeVisible();
  await expect(p2.getByLabel(/^Company: /)).toHaveCount(0);
  await expect(p2.getByRole("link", { name: "+ Add a company" })).toHaveCount(0);
  await p2.goto("/companies/new");
  await expect(p2).toHaveURL(/\/overview/);
  await single.close();
});
