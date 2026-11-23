import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The weekly check-in (Nov 24, 2026): from the Overview, the founder moves a slipped commitment's
 * date, says how a finished one went, ticks off this week's, and starts the week's conversation from
 * a summary already written for them. The advisor sees the outcomes.
 */
test("weekly check-in: move, finish, record outcomes, talk the week through", async ({ browser }) => {
  const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const a = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('chk-adv@e2e.test','e2e:chk-adv@e2e.test','advisor','Cal Advisor', now()) on conflict (auth_user_id) do update set role = 'advisor' returning id");
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('chk-founder@e2e.test','e2e:chk-founder@e2e.test','founder','Kit Founder', now()) on conflict (auth_user_id) do update set name = 'Kit Founder' returning id");
  await db.query("delete from companies where name = 'Checkco'");
  const c = await db.query("insert into companies (name, revenue_band, stage, advisor_id) values ('Checkco', '1m_3m', 'Seed', $1) returning id", [a.rows[0].id]);
  const company = c.rows[0].id;
  await db.query("delete from company_members where user_id = $1", [u.rows[0].id]);
  await db.query("insert into company_members (company_id, user_id, member_role) values ($1, $2, 'owner')", [company, u.rows[0].id]);
  const p = await db.query("insert into growth_projects (company_id, name, started_on) values ($1, 'First AE hire', $2) returning id", [company, iso(-20)]);
  const project = p.rows[0].id;
  const ins = "insert into commitments (company_id, project_id, title, owner, due_on, status, closed_at, position) values ($1, $2, $3, 'Kit Founder', $4, $5, $6, $7)";
  await db.query(ins, [company, project, "Write the AE scorecard", iso(-3), "open", null, 1]);
  await db.query(ins, [company, project, "Book three AE interviews", iso(2), "open", null, 2]);
  await db.query(ins, [company, project, "Post the AE job", iso(-5), "done", new Date(Date.now() - 2 * 86_400_000), 3]);
  await db.query(ins, [company, project, "Agree the comp plan", iso(40), "open", null, 4]);
  await db.end();

  const as = async (email: string) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
    return { ctx, page: await ctx.newPage() };
  };

  const f = await as("chk-founder@e2e.test");
  await f.page.goto("/overview");
  await expect(f.page.getByRole("heading", { name: "What are you working through?" })).toBeVisible({ timeout: 120_000 });
  await f.page.getByRole("link", { name: "Weekly check-in (3)" }).click();
  await expect(f.page.getByRole("heading", { name: "Weekly check-in", level: 1 })).toBeVisible();

  // Slipped: a new date.
  const slipped = f.page.getByRole("list", { name: "Slipped" });
  await expect(slipped).toContainText("Overdue: was due");
  await slipped.getByRole("button", { name: "Move date: Write the AE scorecard" }).click();
  await slipped.getByLabel("New due date: Write the AE scorecard").fill(iso(3));
  await slipped.getByRole("button", { name: "Save date" }).click();
  await expect(f.page.getByRole("list", { name: "Slipped" })).toHaveCount(0);
  await expect(f.page.getByRole("list", { name: "Due this week" })).toContainText("Write the AE scorecard");

  // Done: how did it go?
  const outcomes = f.page.getByRole("list", { name: "Done: how did it go?" });
  await outcomes.getByLabel("What happened: Post the AE job").fill("40 applicants in a week");
  await outcomes.getByRole("group", { name: "How did it go: Post the AE job" }).getByRole("button", { name: "Worked", exact: true }).click();
  await expect(f.page.getByRole("list", { name: "Done: how did it go?" })).toHaveCount(0);

  // Ticking one off this week makes it ask how it went.
  const week = f.page.getByRole("list", { name: "Due this week" });
  await week.getByRole("checkbox", { name: "Done: Book three AE interviews" }).check();
  await expect(f.page.getByRole("group", { name: "How did it go: Book three AE interviews" })).toBeVisible();
  await f.page.getByRole("group", { name: "How did it go: Book three AE interviews" }).getByRole("button", { name: "Partly worked" }).click();

  // The week's conversation starts from where things stand (once the last save has landed).
  const box = f.page.getByRole("textbox", { name: "What are you working through?" });
  await expect(async () => {
    await f.page.reload();
    await expect(box).toHaveValue(/- Done: Book three AE interviews \(partly worked\)/, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(box).toHaveValue(/^Weekly check-in\./);
  await expect(box).toHaveValue(/- Done: Post the AE job \(worked: 40 applicants in a week\)/);
  await expect(box).toHaveValue(/- Done: Book three AE interviews \(partly worked\)/);
  await expect(box).toHaveValue(/- Due this week: Write the AE scorecard/);
  await expect(box).not.toHaveValue(/Agree the comp plan/);
  await f.page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(f.page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(f.page.getByRole("heading", { name: /^Weekly check-in\./ })).toBeVisible();

  // The advisor sees the outcomes on the project.
  const adv = await as("chk-adv@e2e.test");
  await adv.page.goto(`/advisor/companies/${company}/projects`);
  const list = adv.page.getByRole("list", { name: "Commitments of First AE hire" });
  await expect(list.getByRole("listitem").filter({ hasText: "Post the AE job" })).toContainText("Worked");
  await expect(list.getByRole("listitem").filter({ hasText: "Post the AE job" })).toContainText("40 applicants in a week");
  await expect(list.getByRole("listitem").filter({ hasText: "Book three AE interviews" })).toContainText("Partly worked");

  // The weekly email's unsubscribe link checks its signature.
  const bad = await f.page.request.get(`/api/email/unsubscribe?k=weekly&u=${u.rows[0].id}&t=${"0".repeat(32)}`);
  expect(bad.status()).toBe(400);

  await adv.ctx.close();
  await f.ctx.close();
});
