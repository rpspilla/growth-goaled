import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The founder's Overview leads with the company and its plan; the advisor names the plan and asks
 * for data; Performance shows plan progress and dated business numbers, with the upload area the
 * request links to.
 */
test("advisor names the plan and asks for data; the founder sees progress and dated numbers", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const a = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('perf-cro@e2e.test','e2e:perf-cro@e2e.test','advisor','Ryan CRO', now()) on conflict (auth_user_id) do update set role = 'advisor' returning id");
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('perf@e2e.test','e2e:perf@e2e.test','founder','Pat', now()) on conflict (auth_user_id) do update set name = 'Pat' returning id");
  const c = await db.query("insert into companies (name, revenue_band, stage, advisor_id) values ('Fasten Perf', '1m_3m', 'Seed', $1) returning id", [a.rows[0].id]);
  const company = c.rows[0].id;
  await db.query("insert into company_members (company_id, user_id, member_role) values ($1, $2, 'owner')", [company, u.rows[0].id]);

  const as = async (email: string) => {
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
    return { ctx, page: await ctx.newPage() };
  };

  // Founder: company first in the menu, then team; no plan yet means one big way to start.
  const f = await as("perf@e2e.test");
  await f.page.goto("/overview");
  const menu = f.page.getByRole("navigation", { name: "Menu" }).getByRole("link");
  // One "Company profile" heading in the menu, open to start, with everything under it.
  const companyProfile = f.page.getByRole("navigation", { name: "Menu" }).getByRole("button", { name: "Company profile" });
  await expect(companyProfile).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveText(["Company Details", "Team", "Overview", "Growth Projects", "Performance", "Documents", "What's Next?"]);
  await companyProfile.click();
  await expect(menu).toHaveCount(0);
  await companyProfile.click();
  await expect(menu).toHaveCount(7);
  await expect(f.page.getByRole("heading", { name: "Fasten Perf", level: 1 })).toBeVisible();
  await expect(f.page.getByText("Add your website to your company profile to show your logo and what you do.")).toBeVisible();
  await expect(f.page.getByRole("link", { name: "Start a new plan with your advisor here" })).toBeVisible();
  // Every other founder page carries the company's branding in the same format (the Overview has the full one).
  await expect(f.page.getByRole("banner", { name: "Fasten Perf branding" })).toHaveCount(0);
  for (const path of ["/chat", "/performance", "/documents", "/profile/company", "/team", "/library"]) {
    await f.page.goto(path);
    await expect(f.page.getByLabel("Fasten Perf branding"), path).toContainText("Fasten Perf");
  }
  await f.page.goto("/overview");

  // Advisor: names the plan and asks for an update.
  const adv = await as("perf-cro@e2e.test");
  await adv.page.goto(`/advisor/companies/${company}`);
  // The advisor's company pages carry the same branding.
  await expect(adv.page.getByLabel("Fasten Perf branding")).toContainText("Fasten Perf");
  const planForm = adv.page.getByRole("region", { name: "Current plan" });
  await planForm.getByLabel("Current plan name").fill("Sales Hiring");
  await planForm.getByRole("button", { name: "Save" }).click();
  await expect(planForm.getByLabel("Current plan name")).toHaveValue("Sales Hiring");
  const ask = adv.page.getByRole("region", { name: "Request data" });
  await ask.getByRole("button", { name: "Send request" }).click();
  await expect(ask.getByRole("alert")).toContainText("Say what you need");
  await ask.getByLabel("Retention or churn figures").check();
  await ask.getByLabel("Note for the founder").fill("Before Thursday's review, please");
  await ask.getByRole("button", { name: "Send request" }).click();
  // Test mode sends no email: the advisor is told so.
  await expect(ask.getByRole("status")).toContainText("email didn't go out");
  await expect(ask.getByRole("list", { name: "Data requests" })).toContainText("Waiting");
  // The portfolio shows the engagement from the plan, and no plan progress until there are actions.
  await adv.page.goto("/advisor/portfolio");
  const row = adv.page.getByRole("link", { name: /Fasten Perf/ });
  await expect(row).toContainText("Advisory");
  await expect(row).toContainText("Sales Hiring");
  await expect(row).toContainText("No actions yet");
  await expect(adv.page.getByText("Engagement Type")).toBeVisible();
  await expect(adv.page.getByText("Action Plan Progress")).toBeVisible();
  await adv.page.goto(`/advisor/companies/${company}`);
  // Contracts and billing live on the company record: drop the signed file and it's read for you.
  const contracts = adv.page.getByRole("region", { name: "Contracts and billing" });
  await expect(contracts.getByRole("button", { name: "Drop a contract here, or choose a file" })).toContainText("Drag and drop a signed contract here");
  // (Test mode has no file storage: a dropped file is simulated as already uploaded, its first read having failed.)
  await db.query("insert into contracts (company_id, title, status, blob_url, filename, mime, read_status, read_error) values ($1, 'Signed MSA', 'draft', 'e2e://signed-msa.pdf', 'Signed_MSA.pdf', 'application/pdf', 'failed', 'Temporary problem')", [company]);
  await adv.page.reload();
  const list = contracts.getByRole("list", { name: "Contracts" });
  await list.getByRole("listitem", { name: "Signed MSA" }).getByRole("button", { name: "Try again" }).click();
  const read = list.getByRole("listitem", { name: "Test mode: Execute & Monitor agreement" });
  await expect(read).toBeVisible({ timeout: 15_000 });
  await expect(read.getByLabel("Test mode: Execute & Monitor agreement details")).toContainText("$1,199 · monthly");
  await expect(read.getByLabel("Test mode: Execute & Monitor agreement details")).toContainText("Nov 1, 2026 – Oct 31, 2027");
  await expect(read).toContainText("Scope: monthly CRO support");
  await expect(read).toContainText("Signed_MSA.pdf");
  // What was read can be corrected.
  await read.getByRole("button", { name: /^Edit details:/ }).click();
  const fix = read.getByRole("form", { name: /^Edit / });
  await fix.getByLabel("Name").fill("Execute & Monitor agreement");
  await fix.getByRole("button", { name: "Save details" }).click();
  const signed = list.getByRole("listitem", { name: "Execute & Monitor agreement" });
  await expect(signed).toBeVisible();
  const next = signed.getByLabel("Execute & Monitor agreement details").locator("dd").nth(3);
  const before = await next.textContent();
  await signed.getByRole("button", { name: "Mark billed: Execute & Monitor agreement" }).click();
  await expect(next).not.toHaveText(before!);
  // Still possible without a file.
  await contracts.getByRole("button", { name: "No file? Enter a contract by hand" }).click();
  const add = contracts.getByRole("form", { name: "Add a contract" });
  await add.getByLabel("Name").fill("Pilot SOW");
  await add.getByLabel("Amount per bill ($)").fill("5,000");
  await add.getByLabel("Billing cycle").selectOption("one_time");
  await add.getByRole("button", { name: "Save contract" }).click();
  await expect(list.getByRole("listitem", { name: "Pilot SOW" })).toContainText("$5,000 one-time");
  await adv.ctx.close();
  const req = await db.query("select id from data_requests where company_id = $1", [company]);

  // Founder: the plan leads the Overview.
  await f.page.reload();
  await expect(f.page.getByRole("region", { name: "Current plan" })).toContainText("Sales Hiring");
  await expect(f.page.getByRole("link", { name: "Start a new plan with your advisor here" })).toHaveCount(0);

  // The email's link: Performance, at the upload area, with what was asked.
  await f.page.goto(`/performance?request=${req.rows[0].id}#upload`);
  const asked = f.page.getByRole("region", { name: "Your advisor asked for an update" });
  await expect(asked).toContainText("Ryan CRO asked for an update");
  await expect(asked).toContainText("Retention or churn figures");
  await expect(asked).toContainText("Before Thursday's review, please");
  await expect(f.page.getByRole("region", { name: "Share new data" })).toBeVisible();
  await expect(f.page.getByRole("button", { name: /Choose files|browse/i }).or(f.page.getByText(/Drop|drag/i).first())).toBeVisible();

  // (i) Action plan progress and (ii) business metrics are always there.
  await expect(f.page.getByRole("heading", { name: "Action plan progress" })).toBeVisible();
  await expect(f.page.getByRole("region", { name: "Current plan" })).toContainText("Sales Hiring");
  for (const name of ["Revenue", "Month-over-month growth", "Retention"]) await expect(f.page.getByLabel(name, { exact: true })).toContainText("No figure yet");

  // Two months typed in: revenue, growth worked out, retention; each update dated.
  const form = f.page.getByRole("form", { name: "Add an update" });
  await form.getByLabel("Month", { exact: true }).fill("2026-09");
  await form.getByLabel("Monthly revenue ($)").fill("80,000");
  await form.getByRole("button", { name: "Add update" }).click();
  await expect(form.getByRole("status")).toBeVisible();
  await form.getByLabel("Month", { exact: true }).fill("2026-10");
  await form.getByLabel("Monthly revenue ($)").fill("86000");
  await form.getByLabel("Net revenue retention (%)").fill("104");
  await form.getByRole("button", { name: "Add update" }).click();
  await expect(f.page.getByLabel("Revenue", { exact: true })).toContainText("about $86K a month", { timeout: 10_000 });
  await expect(f.page.getByLabel("Revenue", { exact: true })).toContainText("Was $960K");
  await expect(f.page.getByLabel("Month-over-month growth", { exact: true })).toContainText("7.5%");
  await expect(f.page.getByLabel("Retention", { exact: true })).toContainText("104%");
  await expect(f.page.getByRole("list", { name: "Update history" }).getByRole("listitem").first()).toContainText("Entered by hand");

  // The advisor clears the latest update; the founder sees the one before it again.
  const adv2 = await as("perf-cro@e2e.test");
  await adv2.page.goto(`/advisor/companies/${company}`);
  const updates = adv2.page.getByRole("list", { name: "Business updates" });
  await expect(updates.getByRole("listitem")).toHaveCount(2);
  // Only admins can change an update's date; this advisor sees the dates as text.
  await expect(updates.getByRole("textbox", { name: /^Date entered/ })).toHaveCount(0);
  await updates.getByRole("button", { name: /^Remove the update from/ }).first().click();
  await expect(updates.getByRole("listitem")).toHaveCount(1);
  // And deletes the data request; it leaves the founder's page too.
  const sentRequests = adv2.page.getByRole("list", { name: "Data requests" });
  await expect(sentRequests.getByRole("listitem")).toHaveCount(1);
  await sentRequests.getByRole("button", { name: /^Delete the request from/ }).click();
  await expect(adv2.page.getByRole("list", { name: "Data requests" })).toHaveCount(0);
  await adv2.ctx.close();
  await f.page.reload();
  await expect(f.page.getByLabel("Revenue", { exact: true })).toContainText("about $80K a month");
  await expect(f.page.getByRole("region", { name: "Your advisor asked for an update" })).toHaveCount(0);

  // An admin corrects the date the remaining update was entered; the founder sees the new date.
  await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('perf-admin@e2e.test','e2e:perf-admin@e2e.test','admin','Ada Admin', now()) on conflict (auth_user_id) do update set role = 'admin'");
  const adm = await as("perf-admin@e2e.test");
  await adm.page.goto(`/advisor/companies/${company}`);
  const dated = adm.page.getByRole("list", { name: "Business updates" });
  await dated.getByRole("textbox", { name: /^Date entered/ }).or(dated.getByLabel(/^Date entered/)).first().fill("2026-10-01");
  await dated.getByRole("button", { name: /^Save the date/ }).first().click();
  await expect(dated.getByLabel("Date entered for the update from Oct 1, 2026")).toBeVisible();
  await adm.ctx.close();
  await f.page.reload();
  await expect(f.page.getByLabel("Revenue", { exact: true })).toContainText("Updated Oct 1, 2026");
  await expect(f.page.getByLabel("Retention", { exact: true })).toContainText("No figure yet");
  await db.end();
  await f.ctx.close();
});
