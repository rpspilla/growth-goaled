import { expect, test, type Browser } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

const as = async (browser: Browser, email: string) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
  return { ctx, page: await ctx.newPage() };
};

/** From a conversation's recommendation to an action plan: Diagnose ($499) approved by an advisor, and Execute & Monitor (monthly) with the advisor in the conversation. */
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
  await page.goto("/chat");
  await page.getByRole("button", { name: "Should we hire more salespeople?" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("region", { name: "Build my action plan" })).toHaveCount(0);
  await page.getByLabel("Your reply").fill("We have 3 reps.");
  await page.getByRole("button", { name: "Send" }).click();
  const offer = page.getByRole("region", { name: "Build my action plan" });
  await expect(offer).toContainText("$499");
  await expect(offer).toContainText("$1,199");
  await expect(offer).toContainText("CRO-reviewed diagnosis");
  await offer.getByRole("button", { name: "Diagnose My Growth" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}\?checkout=started$/);
  const panel = page.getByRole("region", { name: "Your action plan" });
  await expect(panel).toContainText("Gathering what it needs");
  await expect(page.getByRole("region", { name: "Build my action plan" })).toHaveCount(0);

  // The AI collects what the plan needs, then the founder submits it for review.
  // The reply box is controlled: re-type until the page has hydrated and Send is enabled.
  await expect(async () => {
    await page.getByLabel("Your reply").fill("Our quota is $600k per rep.");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 1_000 });
  }).toPass();
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
  // No tools, risks or assumptions on the plan any more; Ryan's name is the person behind it.
  await expect(panel.getByRole("region", { name: "Tools to evaluate" })).toHaveCount(0);
  await expect(panel.getByText("Risks", { exact: true })).toHaveCount(0);
  await expect(panel.getByTestId("human-presence-plan")).toContainText("Ryan Spillane, CEO & Founder");
  await expect(panel.getByTestId("human-presence-plan")).toContainText("2 IPOs");
  // A board of founder inputs: each card names the exact fields, answered by typing them or dropping a file.
  const board = panel.getByRole("group", { name: "Plan board" });
  await expect(board.getByRole("region", { name: "To do" }).getByRole("listitem")).toHaveCount(3);
  await expect(board.getByRole("combobox", { name: /Who takes responsibility/ })).toHaveCount(0);
  await expect(board.getByRole("button", { name: /^Move to In progress/ })).toHaveCount(0);
  const first = board.getByRole("listitem", { name: "Test 30-day milestone" });
  await expect(first).toContainText("Needed: Average deal cycle, founder-closed · Average deal cycle, AE-closed");
  // Growth Goaled's tasks are for advisors only.
  await expect(panel).not.toContainText("model the hiring plan");
  await panel.getByRole("button", { name: "Start the plan" }).click();
  await expect(panel.getByRole("region", { name: "Before you start" })).toHaveCount(0);
  // The file option lists the exact columns.
  await first.getByRole("button", { name: "Answer: Test 30-day milestone" }).click();
  await first.getByRole("tab", { name: "Drop a file" }).click();
  await expect(first).toContainText("The file needs these columns: Deal name, Owner, Created date, Close date");
  await first.getByRole("tab", { name: "Type the values" }).click();
  const form = first.getByRole("form", { name: "Answer: Test 30-day milestone" });
  await form.getByLabel("Average deal cycle, founder-closed (days)").fill("30");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(first.getByRole("alert")).toContainText("Enter Average deal cycle, AE-closed.");
  await form.getByLabel("Average deal cycle, AE-closed (days)").fill("45");
  await form.getByRole("button", { name: "Save" }).click();
  // Answering completes it.
  await expect(board.getByRole("region", { name: "Complete" }).getByRole("listitem")).toHaveCount(1);
  await expect(board.getByRole("region", { name: "Complete" })).toContainText("Average deal cycle, founder-closed: 30 days · Average deal cycle, AE-closed: 45 days");
  // The other cards still move left to right.
  await board.getByRole("button", { name: "Move to In progress: Test 60-day milestone" }).click();
  await expect(board.getByRole("region", { name: "In progress" }).getByRole("listitem")).toHaveCount(1);
  await expect(panel).toContainText("1 of 3 milestones done");
  // The advisor sees Growth Goaled's tasks, the founder's answers, and a To Do to quote the work.
  await cro.page.goto(cro.page.url());
  await expect(cro.page.getByRole("region", { name: "Growth Goaled's tasks" })).toContainText("Test mode: model the hiring plan from the founder's inputs");
  await expect(cro.page.getByRole("region", { name: "Plan" })).toContainText("Answered: Average deal cycle, founder-closed: 30 days");
  await expect(cro.page.getByLabel("Planner Co branding")).toContainText("Planner Co");
  await cro.page.goto("/advisor/portfolio");
  await expect(cro.page.getByRole("link", { name: /Planner Co/ })).toContainText("Diagnose");
  await expect(cro.page.getByLabel("Action plan progress: 1 of 3 done")).toBeVisible();
  await cro.page.goto("/advisor/registers");
  await expect(cro.page.getByText("Review and quote Growth Goaled's work on the plan (1 task)")).toBeVisible();
  await cro.page.getByRole("button", { name: /^Mark complete: Review and quote/ }).click();
  await expect(cro.page.getByText("Review and quote Growth Goaled's work on the plan (1 task)")).toHaveCount(0);

  // --- Execute & Monitor (monthly): the advisor is in the conversation ---
  await page.goto("/chat");
  await page.getByRole("button", { name: "Who should my first GTM hire be?" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await page.getByLabel("Your reply").fill("We have 2 AEs.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("region", { name: "Build my action plan" }).getByRole("button", { name: "Start Improving Revenue" }).click();
  await expect(page).toHaveURL(/checkout=started$/);
  await expect(panel).toContainText("Supported · Casey CRO");
  await expect(panel).toContainText("Test mode goal for Who should my first GTM hire be?", { timeout: 30_000 });
  const supportedUrl = page.url().replace(/\?.*$/, "");
  // Self-serve billing: "Manage billing" goes to Stripe's portal and back to this conversation.
  await panel.getByRole("link", { name: "Manage billing" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}\?billing=portal-e2e$/);

  // Execute & Monitor: milestones have deadlines the founder can change, and targets track their numbers.
  await expect(panel).toContainText(/Due \w{3} \d+/);
  await panel.getByRole("button", { name: "Edit owner and deadline: Test 30-day milestone" }).click();
  const edit = panel.getByRole("form", { name: "Edit Test 30-day milestone" });
  await edit.getByLabel("Owner").fill("Head of Sales");
  await edit.getByLabel("Due date").fill("2020-01-15");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(panel).toContainText("Head of Sales");
  await expect(panel).toContainText("Overdue: was due Jan 15");
  const targets = panel.getByRole("region", { name: "Targets" });
  await targets.getByRole("button", { name: "+ Add a target" }).click();
  const add = targets.getByRole("form", { name: "Add a target" });
  await add.getByLabel("Metric").selectOption({ label: "Win Rate" });
  await add.getByLabel("Target").fill("25");
  await add.getByRole("button", { name: "Add" }).click();
  await expect(targets).toContainText("Win Rate");
  await expect(targets).toContainText("target 25%");
  const live = panel.getByRole("region", { name: "Your CRO advisor" });
  await expect(live).toContainText("0m of 2h used");
  await expect(live.getByRole("link", { name: "Book your monthly review" })).toHaveAttribute("href", "/advisory/book?kind=monthly&offer=review");

  await cro.page.goto("/advisor/plans");
  await cro.page.getByRole("region", { name: /Supported plans/ }).getByRole("link", { name: /Planner Co/ }).click();
  await cro.page.getByLabel("Your message to the founder").fill("Let's talk about a player-coach first.");
  await cro.page.getByRole("button", { name: "Send to founder" }).click();
  await expect(cro.page.getByText("Let's talk about a player-coach first.")).toBeVisible();
  // The advisor logs live support; it counts against the founder's two hours this month.
  const log = cro.page.getByRole("form", { name: "Log a session" });
  await log.getByLabel("Type").selectOption("support");
  await log.getByLabel("Minutes").fill("45");
  await log.getByLabel("Note (optional)").fill("Pipeline review");
  await log.getByRole("button", { name: "Log it" }).click();
  await expect(cro.page.getByRole("region", { name: "Live time with the founder" })).toContainText("Pipeline review");

  await page.goto(supportedUrl);
  await expect(page.getByText("Your advisor · Casey CRO")).toBeVisible();
  await expect(page.getByText("Let's talk about a player-coach first.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Your CRO advisor" })).toContainText("45m of 2h used, 1h 15m left");
  await founder.ctx.close();
  await cro.ctx.close();
});
