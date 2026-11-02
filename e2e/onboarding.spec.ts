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
  await page.getByRole("button", { name: "Continue to growth questions" }).click();
  // "Other" needs a name; what was typed is kept.
  await expect(page.getByText("Tell us your vertical.")).toBeVisible();
  await expect(page.locator("#aes")).toHaveValue("10");
  await expect(page.locator("#companyName")).toHaveValue("Deer in Headlights");
  await page.locator("#verticalOther").fill("Customer experience");
  await page.getByRole("button", { name: "Continue to growth questions" }).click();
  await expect(page).toHaveURL(/\/library\?welcome=1$/);

  // --- Library: fixed order, no "Recommended" tag ---
  await expect(page.getByText("Recommended for you")).toHaveCount(0);
  const titles = page.locator("article h2");
  for (const [i, title] of ["Build a repeatable sales motion", "Build a growth hiring plan", "How do I fix churn?"].entries()) await expect(titles.nth(i)).toHaveText(title);

  // --- 1.9: open another question first, come back, then the hiring plan opens its own page ---
  await page.locator("article", { has: page.getByRole("heading", { name: "How do I fix churn?" }) }).getByRole("link").click();
  await expect(page).toHaveURL(/\/library\/growth_leak$/);
  await page.getByRole("link", { name: "All growth questions" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.locator("article", { has: page.getByRole("heading", { name: "Build a growth hiring plan" }) }).getByRole("link").click();
  await expect(page).toHaveURL(/\/library\/hire_or_fix$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Build a growth hiring plan");
  // Browser back and forward land on the right question too.
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/library\/growth_leak$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How do I fix churn?");
  await page.goForward();
  await page.goForward();
  await expect(page).toHaveURL(/\/library\/hire_or_fix$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Build a growth hiring plan");

  // --- Nothing asked before the Snapshot: the basics are known ---
  await expect(page.getByRole("button", { name: /^Question \d+:/ })).toHaveCount(0);
  const known = page.getByLabel("Already known from your profile");
  for (const text of ["$10M–$20M", "Seed", "2020", "Other"]) await expect(known).toContainText(text);
  await page.getByRole("button", { name: "See my free Snapshot" }).click();
  await expect(page).toHaveURL(/\/library\/hire_or_fix\/snapshot$/);

  // --- Profile: pre-filled from sign-up, all optional, and nothing re-entered ---
  await page.goto("/profile/company");
  await expect(page.locator("#intake-founded_year")).toHaveValue("2020");
  await expect(page.locator("#intake-stage")).toHaveValue("Seed");
  await expect(page.locator("#intake-industry")).toHaveValue("Other");
  await expect(page.locator("#intake-industry_other")).toHaveValue("Customer experience");
  await expect(page.getByText("You told us $10M–$20M at sign-up.")).toBeVisible();
  await expect(page.getByText("All optional.")).toBeVisible();
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
