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
  // Sign-up lands on the main entry: the conversation starters.
  await expect(page).toHaveURL(/\/overview\?welcome=1$/);
  await expect(page.getByText(/You're set up, Deer in Headlights\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a new plan with your advisor here" })).toBeVisible();
  // The old growth-question pages still open directly.
  // --- 1.9: open another question first, come back, then the hiring plan opens its own page ---
  await page.goto("/library/growth_leak");
  await page.goto("/library/hire_or_fix");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Build a growth hiring plan");
  // Browser back and forward land on the right question too.
  await page.goBack();
  await expect(page).toHaveURL(/\/library\/growth_leak$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How do I fix churn?");
  await page.goForward();
  await expect(page).toHaveURL(/\/library\/hire_or_fix$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Build a growth hiring plan");

  // --- Nothing asked before the Snapshot: the basics are known ---
  await expect(page.getByRole("button", { name: /^Question \d+:/ })).toHaveCount(0);
  const known = page.getByLabel("Already known from your profile");
  for (const text of ["$10M–$20M", "Seed", "2020", "Other"]) await expect(known).toContainText(text);
  await page.getByRole("button", { name: "See my free Snapshot" }).click();
  await expect(page).toHaveURL(/\/library\/hire_or_fix\/snapshot$/);

  // --- Overview: AE ramp time has a place even before there's data; benchmarks under their new name ---
  await page.goto("/overview");
  const ramp = page.getByLabel("AE Ramp Time");
  await expect(ramp).toContainText("Not enough data yet");
  await expect(page.getByRole("heading", { name: "Company Benchmark Performance" })).toBeVisible();

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

test("growth questions: four options, no pricing, and the current plan", async ({ browser }) => {
  const { Client } = await import("pg");
  const { E2E_DATABASE_URL } = await import("../playwright.config");
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('ask@e2e.test', 'e2e:ask@e2e.test', 'founder', 'Ask', now()) on conflict (auth_user_id) do update set name = 'Ask' returning id");
  const c = await db.query("insert into companies (name, revenue_band) values ('Ask Co', '1m_3m') returning id");
  await db.query("insert into company_members (company_id, user_id) values ($1, $2)", [c.rows[0].id, u.rows[0].id]);

  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: "ask@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "What do you need to decide?" })).toBeVisible();
  const options = page.locator("article");
  for (const [i, name] of ["Build a repeatable sales motion", "Revenue conversion sprint", "See my current plan", "Custom Project"].entries()) await expect(options.nth(i)).toHaveAttribute("aria-label", name);
  await expect(options).toHaveCount(4);
  await expect(page.locator("main, body").first()).not.toContainText("$");
  await expect(page.getByText(/Snapshot|Assessment \$/)).toHaveCount(0);
  // No plan yet: the advisor's calendar instead.
  const current = page.getByRole("article", { name: "See my current plan" });
  await expect(current.getByRole("link", { name: "Schedule time with an advisor" })).toHaveAttribute("href", "https://calendly.com/ryan-spillane-growthgoaled/30min");
  await expect(page.getByRole("article", { name: "Custom Project" }).getByRole("link", { name: "Discuss a Project" })).toHaveAttribute("href", /calendly\.com/);
  // The FAQ stays.
  await page.getByText("How is this different from prompting Claude or ChatGPT?").click();
  await expect(page.getByText(/same answer every time on the same data/)).toBeVisible();

  // A sprint opens its conversation.
  await page.getByRole("article", { name: "Revenue conversion sprint" }).getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Why isn't our pipeline converting?" })).toBeVisible();
  const conversationId = page.url().split("/").at(-1)!;

  // With a plan underway, "See my current plan" opens it.
  await db.query("insert into action_plans (company_id, conversation_id, topic, tier, status) values ($1, $2, 'pipeline_conversion', 'supported', 'active')", [c.rows[0].id, conversationId]);
  await page.goto("/library");
  await expect(current).toContainText("Why isn't our pipeline converting? · Active");
  await expect(current.getByRole("link", { name: "Open my plan" })).toHaveAttribute("href", `/chat/${conversationId}#your-plan`);
  await db.end();
  await ctx.close();
});
