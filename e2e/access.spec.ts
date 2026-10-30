import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/** Each role only reaches its own area; advisors only their own companies. */

let companyId = "";

test.beforeAll(async () => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const users = [
    ["access-founder@e2e.test", "founder"],
    ["access-advisor@e2e.test", "advisor"],
  ];
  for (const [email, role] of users) {
    await db.query(
      `insert into users (email, auth_user_id, role, name, title, onboarded_at) values ($1, $2, $3, 'E2E', 'E2E', now()) on conflict (auth_user_id) do nothing`,
      [email, `e2e:${email}`, role],
    );
  }
  const c = await db.query(`insert into companies (name) values ('Access Co') returning id`);
  companyId = c.rows[0].id;
  await db.query(
    `insert into company_members (company_id, user_id, member_role) select $1, id, 'owner' from users where email = 'access-founder@e2e.test'`,
    [companyId],
  );
  await db.end();
});

const as = async (browser: import("@playwright/test").Browser, email: string) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
  return { ctx, page: await ctx.newPage() };
};

test("signed-out visitors go to sign-in", async ({ page }) => {
  for (const path of ["/overview", "/data", "/advisor/portfolio", "/advisor/review"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/sign-in/);
  }
});

test("founders can't open advisor pages", async ({ browser }) => {
  const { ctx, page } = await as(browser, "access-founder@e2e.test");
  for (const path of ["/advisor/portfolio", "/advisor/benchmarks", "/advisor/benchmark-library", "/advisor/benchmark-library/sources", "/advisor/analytics", `/advisor/companies/${companyId}`]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/library$/); // their next step: no question chosen yet;
  }
  await ctx.close();
});

test("old founder routes redirect into the five steps", async ({ browser }) => {
  const { ctx, page } = await as(browser, "access-founder@e2e.test");
  const cases: [string, RegExp][] = [
    ["/dashboard", /\/overview$/],
    ["/readiness", /\/data$/],
    ["/readiness/files", /\/data\/files$/],
    ["/questions", /\/data\/questions$/],
    ["/upload", /\/data$/],
    ["/intake/company", /\/profile\/company$/],
    // No active use case yet, so Baseline sends them to the library.
    ["/benchmark", /\/library$/],
    ["/hiring", /\/library$/],
  ];
  for (const [from, to] of cases) {
    await page.goto(from);
    await expect(page, from).toHaveURL(to);
  }
  // Data is locked until an assessment is bought.
  await page.goto("/data");
  await expect(page.getByText(/This step unlocks when you buy an assessment\./)).toBeVisible();
  await ctx.close();
});

test("paid steps need a payment Stripe confirmed, never a URL or the browser", async ({ browser }) => {
  const { ctx, page } = await as(browser, "access-founder@e2e.test");
  // A made-up success return doesn't unlock anything.
  await page.goto("/api/checkout/return?use_case=growth_leak&session_id=cs_forged");
  await expect(page).toHaveURL(/\/library\/growth_leak\/snapshot\?checkout=pending|\/library\/growth_leak$/);
  await page.goto("/data");
  await expect(page.getByText(/This step unlocks when you buy an assessment\./)).toBeVisible();
  // Results and "open assessment" links for something not bought go back to the library / history.
  await page.goto("/baseline");
  await expect(page).toHaveURL(/\/library$/);
  await page.goto("/assessments/open?use_case=growth_leak");
  await expect(page).toHaveURL(/\/assessments$/);
  await expect(page.getByText("No assessments yet", { exact: true })).toBeVisible();
  await ctx.close();
});

test("advisors can't open founder or admin pages, or companies not assigned to them", async ({ browser }) => {
  const { ctx, page } = await as(browser, "access-advisor@e2e.test");
  for (const path of ["/data", "/data/questions", "/baseline", "/advisor/analytics", "/advisor/users", "/advisor/benchmark-library/new"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/advisor\/portfolio$/);
  }
  // The Benchmark Library is read-only for advisors.
  await page.goto("/advisor/benchmark-library");
  await expect(page.getByText("Read only: administrators manage the library.")).toBeVisible();
  await expect(page.getByRole("link", { name: "New dataset" })).toHaveCount(0);
  for (const step of ["", "/library", "/data", "/baseline", "/progress"]) {
    const res = await page.goto(`/advisor/companies/${companyId}${step}`);
    expect(res?.status(), step).toBe(404);
  }
  await ctx.close();
});
