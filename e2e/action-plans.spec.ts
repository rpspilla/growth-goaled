import { expect, test, type Browser } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

const as = async (browser: Browser, email: string) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
  return { ctx, page: await ctx.newPage() };
};

/** From a conversation's recommendation to an action plan: $499 approved by an advisor, and $799/month with the advisor in the conversation. */
test("a founder buys an action plan from the conversation; an advisor approves it or joins the conversation", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const a = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('cro@e2e.test','e2e:cro@e2e.test','advisor','Casey CRO', now()) on conflict (auth_user_id) do update set role = 'advisor' returning id");
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('planner@e2e.test','e2e:planner@e2e.test','founder','Pat', now()) on conflict (auth_user_id) do update set name = 'Pat' returning id");
  const c = await db.query("insert into companies (name, revenue_band, stage, advisor_id) values ('Planner Co', '1m_3m', 'Seed', $1) returning id", [a.rows[0].id]);
  await db.query("insert into company_members (company_id, user_id) values ($1, $2)", [c.rows[0].id, u.rows[0].id]);
  await db.end();

  const founder = await as(browser, "planner@e2e.test");
  const page = founder.page;

  // --- $499: talk it through, see the card, buy the plan ---
  await page.goto("/overview");
  await page.getByRole("button", { name: "Should we hire more salespeople?" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("region", { name: "Build my action plan" })).toHaveCount(0);
  await page.getByLabel("Your reply").fill("We have 3 reps.");
  await page.getByRole("button", { name: "Send" }).click();
  const offer = page.getByRole("region", { name: "Build my action plan" });
  await expect(offer).toContainText("$499");
  await expect(offer).toContainText("$799");
  await expect(offer).toContainText("Reviewed and approved by a Growth Goaled advisor");
  await offer.getByRole("button", { name: "Buy the action plan" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}\?checkout=started$/);
  const panel = page.getByRole("region", { name: "Your action plan" });
  await expect(panel).toContainText("Gathering what it needs");
  await expect(page.getByRole("region", { name: "Build my action plan" })).toHaveCount(0);

  // The AI collects what the plan needs, then the founder submits it for review.
  await page.getByLabel("Your reply").fill("Our quota is $600k per rep.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(panel).toContainText("Closed deals export");
  await panel.getByRole("button", { name: "Submit my plan for review" }).click();
  await expect(panel).toContainText("With your advisor for review");
  await expect(panel).toContainText(/approve it by|within 24 hours/);
  const planUrl = page.url().replace(/\?.*$/, "");

  // The advisor sees it in their queue, edits and approves it.
  const cro = await as(browser, "cro@e2e.test");
  await cro.page.goto("/advisor/plans");
  await expect(cro.page.getByRole("link", { name: /Planner Co/ }).first()).toBeVisible();
  await cro.page.getByRole("link", { name: /Planner Co/ }).first().click();
  await expect(cro.page.getByLabel("Goal")).toHaveValue(/Test mode goal/, { timeout: 30_000 });
  await cro.page.getByLabel("Goal").fill("Hire one more AE once payers convert");
  await cro.page.getByLabel("Note to the founder (optional)").fill("Start with the payer ICP.");
  await cro.page.getByRole("button", { name: "Approve and deliver" }).click();
  await expect(cro.page.getByText("Delivered", { exact: true })).toBeVisible();
  await expect(cro.page.getByText("Hire one more AE once payers convert")).toBeVisible();
  // The founder's email can be re-sent from here; when email isn't working it says why.
  await cro.page.getByRole("button", { name: "Re-send the email to the founder" }).click();
  await expect(cro.page.getByText(/The email wasn.t sent/)).toBeVisible();

  // Delivered to the founder: the Overview says it's ready and opens it.
  await page.goto("/overview");
  const ready = page.getByRole("region", { name: "Your action plans" });
  await expect(ready).toContainText("Your action plan is ready");
  await ready.getByRole("link", { name: "Open your action plan" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}#your-plan$/);
  await expect(panel).toContainText("Approved by your advisor");
  // The email's link: straight to the plan when signed in; a log-in form that lands there when not.
  const conversationPath = new URL(planUrl).pathname;
  await page.goto(`/sign-in?next=${encodeURIComponent(`${conversationPath}#your-plan`)}`);
  await expect(page).toHaveURL(new RegExp(`${conversationPath}#your-plan$`));
  const visitor = await browser.newContext();
  const signedOut = await visitor.newPage();
  await signedOut.goto(`/sign-in?next=${encodeURIComponent(`${conversationPath}#your-plan`)}`);
  await expect(signedOut.getByRole("heading", { name: "Log in to see your action plan" })).toBeVisible();
  await expect(signedOut.getByLabel(/email/i)).toBeVisible();
  await expect(signedOut.getByRole("heading", { name: "How can we help you grow?" })).toHaveCount(0);
  await visitor.close();

  await page.goto(planUrl);
  await expect(panel).toContainText("Approved by your advisor");
  await expect(panel).toContainText("Hire one more AE once payers convert");
  await expect(panel).toContainText("Start with the payer ICP.");
  // Every plan carries tools worth evaluating, and Ryan's name as the person behind it.
  await expect(panel.getByRole("region", { name: "Tools to evaluate" })).toContainText("Test CRM");
  await expect(panel.getByTestId("human-presence-plan")).toContainText("Ryan Spillane, CEO & Founder");
  await expect(panel.getByTestId("human-presence-plan")).toContainText("2 IPOs");
  await panel.getByRole("checkbox", { name: /Done: Test 30-day milestone/ }).check();
  await expect(panel).toContainText("1 of 3 milestones done");

  // --- $799/month: the advisor is in the conversation ---
  await page.goto("/overview");
  await page.getByRole("button", { name: "Who should my first GTM hire be?" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await page.getByLabel("Your reply").fill("We have 2 AEs.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("region", { name: "Build my action plan" }).getByRole("button", { name: "Start the supported plan" }).click();
  await expect(page).toHaveURL(/checkout=started$/);
  await expect(panel).toContainText("Supported · Casey CRO");
  await expect(panel).toContainText("Test mode goal for Who should my first GTM hire be?", { timeout: 30_000 });
  const supportedUrl = page.url().replace(/\?.*$/, "");

  await cro.page.goto("/advisor/plans");
  await cro.page.getByRole("region", { name: /Supported plans/ }).getByRole("link", { name: /Planner Co/ }).click();
  await cro.page.getByLabel("Your message to the founder").fill("Let's talk about a player-coach first.");
  await cro.page.getByRole("button", { name: "Send to founder" }).click();
  await expect(cro.page.getByText("Let's talk about a player-coach first.")).toBeVisible();

  await page.goto(supportedUrl);
  await expect(page.getByText("Your advisor · Casey CRO")).toBeVisible();
  await expect(page.getByText("Let's talk about a player-coach first.")).toBeVisible();
  await founder.ctx.close();
  await cro.ctx.close();
});
