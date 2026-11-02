import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The main entry: a founder picks a conversation starter, answers a question, gets a decision card,
 * rates it, and corrects a remembered fact. Another founder can't open the conversation.
 */
test("a founder talks a decision through and gets a recommendation card", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  for (const [email, company] of [["chat@e2e.test", "Chatty Co"], ["nosy@e2e.test", "Nosy Co"]]) {
    const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ($1, $2, 'founder', 'Chris', now()) on conflict (auth_user_id) do update set name = 'Chris' returning id", [email, `e2e:${email}`]);
    const c = await db.query("insert into companies (name, revenue_band, stage) values ($1, '1m_3m', 'Seed') returning id", [company]);
    await db.query("insert into company_members (company_id, user_id) values ($1, $2)", [c.rows[0].id, u.rows[0].id]);
  }
  await db.end();

  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: "chat@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto("/overview");

  // All twelve starters, in the owner's words, lead the Overview.
  await expect(page.getByRole("heading", { name: "What are you trying to figure out?" })).toBeVisible();
  for (const s of ["How do I build a repeatable revenue engine?", "Who should my first GTM hire be?", "How much equity should I give my first sales hire?", "Are we ready to raise our next round?", "How can we improve retention and revenue efficiency?", "Something else."]) {
    await expect(page.getByRole("button", { name: s })).toBeVisible();
  }

  // A starter opens the conversation, already answered with at most two questions.
  await page.getByRole("button", { name: "Should we hire more salespeople?" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Should we hire more salespeople?" })).toBeVisible();
  await expect(page.getByText(/Test mode: let's work through/)).toBeVisible();
  await expect(page.getByRole("article", { name: "Recommendation" })).toHaveCount(0);
  const url = page.url();

  // Answering gives the decision card, with the action plan offered alongside.
  await page.getByLabel("Your reply").fill("We have 3 reps and close about $20k deals.");
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByRole("article", { name: "Recommendation" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Test mode takeaway for Should we hire more salespeople?");
  await expect(card).toContainText("Low confidence");
  await expect(card).toContainText("Days 1–30");
  await expect(card).toContainText("Assumption");
  // The card converts into an action plan: $499 once, or $799 a month with an advisor.
  await expect(page.getByRole("region", { name: "Build my action plan" })).toContainText("$499");

  // Feedback is kept against the recommendation.
  await card.getByRole("button", { name: "Helpful" }).click();
  await expect(card.getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("article", { name: "Recommendation" }).getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "true");

  // What they said is remembered and can be corrected.
  await page.getByRole("link", { name: "See or correct them" }).click();
  const facts = page.locator("#facts");
  await expect(facts).toContainText("Sales team size");
  await expect(facts).toContainText("You said");
  await facts.getByRole("button", { name: "Correct Sales team size" }).click();
  await facts.getByLabel("Sales team size").fill("4");
  await facts.getByRole("button", { name: "Save" }).click();
  await expect(facts).toContainText("Confirmed");
  await expect(facts).toContainText("4");
  await expect(page.getByRole("link", { name: "Should we hire more salespeople?" })).toBeVisible();

  // "Something else" uses the founder's own words.
  await page.goto("/overview");
  await page.getByRole("button", { name: "Something else." }).click();
  await page.getByLabel("What's on your mind?").fill("Should we raise prices before hiring?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByRole("heading", { name: "Should we raise prices before hiring?" })).toBeVisible();
  await expect(page.getByText(/Pick up where you left off/)).toHaveCount(0);
  await page.goto("/overview");
  await expect(page.getByText(/Pick up where you left off/)).toBeVisible();
  await ctx.close();

  // Another founder can't open it.
  const nosy = await browser.newContext();
  await nosy.addCookies([{ name: "gg_e2e_user", value: "nosy@e2e.test", domain: "localhost", path: "/" }]);
  const p2 = await nosy.newPage();
  const res = await p2.goto(url);
  expect(res?.status()).toBe(404);
  await nosy.close();
});
