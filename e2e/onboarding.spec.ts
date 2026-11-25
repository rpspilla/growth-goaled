import { expect, test } from "@playwright/test";

/**
 * James Winn's walkthrough fixes (Nov 2026, Batch 1): the six sign-up basics, nothing asked twice,
 * the go-to-market team carried into the hiring plan, the fixed question order with no
 * "Recommended" tag, and "Build a growth hiring plan" opening its own questions every time.
 */
test("sign-up basics carry through, and every growth question opens its own page", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: "basics@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();

  // --- Sign-up: the six basics ---
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/welcome/);
  await page.locator("#name").fill("Dee Founder");
  await page.locator("#companyName").fill("Deer in Headlights");
  await page.locator("#revenueBand").selectOption("10m_20m");
  await page.locator("#foundedYear").selectOption("2020");
  await page.locator("#stage").selectOption("Seed");
  // B2B SaaS is a business model, not a vertical: not offered.
  await expect(page.locator("#vertical option", { hasText: "B2B SaaS" })).toHaveCount(0);
  await page.locator("#vertical").selectOption("Other");
  await page.locator("#aes").fill("10");
  await page.locator("#bdrs").fill("4");
  await page.locator("#cs").fill("1");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // "Other" needs a name; what was typed is kept.
  await expect(page.getByText("Tell us your vertical.")).toBeVisible();
  await expect(page.locator("#aes")).toHaveValue("10");
  await expect(page.locator("#companyName")).toHaveValue("Deer in Headlights");
  await page.locator("#verticalOther").fill("Customer experience");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // Sign-up lands in Rally: the first conversation.
  await expect(page).toHaveURL(/\/whats-next$/);
  await expect(page.getByRole("heading", { name: /What's the growth decision in front of you/ })).toBeVisible();
  await page.goto("/overview");
  // The advisor runs the work: until they share a plan, the Overview says so; founders don't pick projects.
  await expect(page.getByText("Your advisor will share your plan here.")).toBeVisible();
  for (const label of ["ARR", "NRR", "Sales Cycle", "MoM Growth"]) await expect(page.getByLabel(label, { exact: true })).toContainText("Not available yet");
  await expect(page.getByRole("heading", { name: "Company Benchmark Performance" })).toBeVisible();
  await page.goto("/library/hire_or_fix");
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText("No growth projects yet.", { exact: false })).toBeVisible();

  // --- Profile: pre-filled from sign-up, all optional, and nothing re-entered ---
  await page.goto("/profile/company");
  await expect(page.locator("#intake-founded_year")).toHaveValue("2020");
  await expect(page.locator("#intake-stage")).toHaveValue("Seed");
  await expect(page.locator("#intake-industry")).toHaveValue("Other");
  await expect(page.locator("#intake-industry_other")).toHaveValue("Customer experience");
  await expect(page.getByText("You told us $10M–$20M at sign-up.")).toBeVisible();
  await expect(page.getByText("All optional.")).toBeVisible();
  // No grey example figures: empty fields ask to be completed.
  await expect(page.locator("#intake-arr")).toHaveAttribute("placeholder", "Please complete this");
  await expect(page.locator("#intake-growth")).toHaveAttribute("placeholder", "Please complete this");
  // Employees is asked as one of the new ranges.
  await expect(page.locator("#intake-employees")).toHaveCount(0);
  await expect(page.locator("#intake-employees_range option")).toHaveText(["Please complete this", "<5", "5–10", "11–20", "21–50", "51–100", "100+"]);
  await page.locator("#intake-employees_range").selectOption("51–100");
  await expect(page.locator('label[for="intake-employees_range"]')).toContainText("✓");
  await page.goto("/profile/gtm");
  await expect(page.locator("#intake-sales_reps")).toHaveValue("10");
  await expect(page.locator("#intake-sdrs")).toHaveValue("4");
  await expect(page.locator("#intake-cs")).toHaveValue("1");
  await page.locator("#intake-marketing").fill("5");
  await page.locator("#intake-marketing").blur();
  await expect(page.locator('label[for="intake-marketing"]')).toContainText("✓");
  await page.goto("/profile/hiring");
  const team = page.getByLabel("Current team", { exact: true });
  for (const text of ["10 Account executives", "4 BDRs / SDRs", "1 Customer success", "5 Marketing"]) await expect(team).toContainText(text);
  await ctx.close();
});

/** A founder whose company was removed (say, a portfolio clean-up) sets up a new one, rather than an endless redirect. */
test("a founder whose company was removed lands on company set-up, not a redirect loop", async ({ browser }) => {
  const { Client } = await import("pg");
  const { E2E_DATABASE_URL } = await import("../playwright.config");
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('removed-co@e2e.test','e2e:removed-co@e2e.test','founder','Remy Removed', now()) on conflict (auth_user_id) do nothing");
  await db.end();
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: "removed-co@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  for (const path of ["/claim", "/", "/whats-next"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.getByRole("heading", { name: "Set up your company" })).toBeVisible();
  }
  await page.locator("#companyName").fill("Second Act");
  await page.locator("#revenueBand").selectOption("1m_3m");
  await page.locator("#foundedYear").selectOption("2020");
  await page.locator("#stage").selectOption("Seed");
  await page.locator("#vertical").selectOption("Fintech");
  await page.locator("#aes").fill("2");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/whats-next$/);
  await ctx.close();
});
