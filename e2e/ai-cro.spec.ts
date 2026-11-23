import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The AI CRO loop (AI CRO sprint, Nov 23, 2026): the founder asks in their own words on the Overview,
 * gets a decision card, commits to it, and the commitments show on the Overview and the project, where
 * they're ticked off; the advisor sees them; the next conversation's CRO knows about them.
 */
test("ask on the Overview, commit to the recommendation, track the commitments", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const a = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('loop-adv@e2e.test','e2e:loop-adv@e2e.test','advisor','Ada Advisor', now()) on conflict (auth_user_id) do update set role = 'advisor' returning id");
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('loop-founder@e2e.test','e2e:loop-founder@e2e.test','founder','Cora Founder', now()) on conflict (auth_user_id) do update set name = 'Cora Founder' returning id");
  await db.query("delete from companies where name = 'Loopco'");
  const c = await db.query("insert into companies (name, revenue_band, stage, advisor_id) values ('Loopco', '1m_3m', 'Seed', $1) returning id", [a.rows[0].id]);
  const company = c.rows[0].id;
  await db.query("delete from company_members where user_id = $1", [u.rows[0].id]);
  await db.query("insert into company_members (company_id, user_id, member_role) values ($1, $2, 'owner')", [company, u.rows[0].id]);
  await db.end();

  const as = async (email: string) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
    return { ctx, page: await ctx.newPage() };
  };

  // --- The founder: the menu starts with the CRO; the Overview opens with the question ---
  const f = await as("loop-founder@e2e.test");
  await f.page.goto("/overview");
  // The first spec alphabetically: the dev server may still be compiling the Overview.
  await expect(f.page.getByRole("heading", { name: "What are you working through?" })).toBeVisible({ timeout: 120_000 });
  await expect(f.page.getByRole("navigation", { name: "Menu" }).getByRole("link").first()).toHaveText("Ask your CRO");
  await expect(f.page.getByRole("region", { name: "Your commitments" })).toHaveCount(0);
  await f.page.getByRole("textbox", { name: "What are you working through?" }).fill("Should we hire our first AE now?");
  await f.page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(f.page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  const conversationUrl = f.page.url();
  await expect(f.page.getByRole("heading", { name: "Should we hire our first AE now?" })).toBeVisible();
  await expect(f.page.getByRole("button", { name: "Commit to this" })).toHaveCount(0);

  // The second answer gives the decision card, and the way to commit to it.
  await f.page.getByLabel("Your reply").fill("Two of us sell today; deals are about $25k.");
  await f.page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(f.page.getByRole("article", { name: "Recommendation" })).toBeVisible();
  await f.page.getByRole("button", { name: "Commit to this" }).click();
  const form = f.page.getByRole("form", { name: "Commit to this recommendation" });
  await expect(form.getByLabel("Commitment 1", { exact: true })).toHaveValue("First test step");
  await expect(form.getByLabel("Owner of commitment 1")).toHaveValue("Cora Founder");
  await expect(form.getByLabel("Measure of commitment 1")).toHaveValue("Test measure");
  await form.getByLabel("Project name").fill("First AE hire");
  await form.getByLabel("Commitment 1", { exact: true }).fill("Write the AE scorecard");
  await form.getByLabel("Due date of commitment 1").fill("2020-01-06");
  await form.getByRole("button", { name: "Commit" }).click();
  const done = f.page.getByRole("status").filter({ hasText: "Committed." });
  await expect(done).toBeVisible();
  await expect(done.getByRole("link", { name: "Open the growth project →" })).toBeVisible();
  // Reloading keeps it committed: the button doesn't come back.
  await f.page.reload();
  await expect(f.page.getByRole("button", { name: "Commit to this" })).toHaveCount(0);
  await expect(f.page.getByRole("status").filter({ hasText: "Committed." })).toContainText("First AE hire");

  // --- The Overview: the conversation to pick up, and the commitment, overdue ---
  await f.page.goto("/overview");
  await expect(f.page.getByRole("list", { name: "Recent conversations" })).toContainText("Should we hire our first AE now?");
  const mine = f.page.getByRole("list", { name: "Your commitments" });
  await expect(mine).toContainText("Write the AE scorecard");
  await expect(mine).toContainText("Overdue: was due Mon, Jan 6");
  await expect(mine).toContainText("Worked if: Test measure");
  await expect(mine.getByRole("link", { name: "First AE hire" })).toBeVisible();
  await expect(mine.getByRole("link", { name: "Discuss with your CRO" })).toHaveAttribute("href", new URL(conversationUrl).pathname);
  await mine.getByRole("checkbox", { name: "Done: Write the AE scorecard" }).check();
  await expect(mine).toHaveCount(0);

  // The project page: where it came from, and the commitment, done (reopened here).
  await f.page.goto("/projects");
  await f.page.getByRole("link", { name: /First AE hire/ }).click();
  await expect(f.page.getByRole("link", { name: "The conversation it came from →" })).toBeVisible();
  const projectList = f.page.getByRole("list", { name: "Commitments of First AE hire" });
  await expect(projectList).toContainText("Done");
  await projectList.getByRole("checkbox", { name: "Done: Write the AE scorecard" }).uncheck();
  await expect(projectList).not.toContainText("Done");

  // --- The advisor sees the founder's commitments on the company's projects ---
  const adv = await as("loop-adv@e2e.test");
  await adv.page.goto(`/advisor/companies/${company}/projects`);
  const advList = adv.page.getByRole("list", { name: "Commitments of First AE hire" });
  await expect(advList).toContainText("Write the AE scorecard");
  await expect(advList).toContainText("Cora Founder");
  await expect(advList.getByRole("checkbox")).toHaveCount(0);
  // The advisor's menu starts with the founder's conversations.
  await adv.page.goto(`/advisor/companies/${company}`);
  await expect(adv.page.getByRole("navigation", { name: "Menu" }).getByRole("link").first()).toHaveText("Conversations");

  await adv.ctx.close();
  await f.ctx.close();
});
