import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The Founder View redesign (Nov 16, 2026): the advisor owns the work and the founder views it. The
 * advisor starts a growth project, shares its action plan and documents, adds a result and this
 * week's priorities; the founder sees them on the Overview and the project, results only once
 * approved; Growth Projects is a history; Data is one shared page; Performance is company-only.
 */
test("the advisor runs the work; the founder sees plans, priorities, approved results and their numbers", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('fv-admin@e2e.test','e2e:fv-admin@e2e.test','admin','Fay Admin', now()) on conflict (auth_user_id) do update set role = 'admin'");
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('fv@e2e.test','e2e:fv@e2e.test','founder','Vic', now()) on conflict (auth_user_id) do update set name = 'Vic' returning id");
  await db.query("delete from companies where name = 'Viewco'");
  const c = await db.query("insert into companies (name, revenue_band, stage) values ('Viewco', '1m_3m', 'Seed') returning id");
  const company = c.rows[0].id;
  await db.query("delete from company_members where user_id = $1", [u.rows[0].id]);
  await db.query("insert into company_members (company_id, user_id, member_role) values ($1, $2, 'owner')", [company, u.rows[0].id]);
  for (const [metric, value, unit] of [["arr", 1296000, "usd"], ["nrr", 112, "percent"], ["sales_cycle_days", 62, "days"], ["mom_growth", 3.8, "percent"], ["customers", 14, "count"]] as const)
    await db.query("insert into data_points (company_id, metric, value, unit, origin, status, confidence, period) values ($1, $2, $3, $4, 'manual', 'accepted', 'high', 'Nov 2026')", [company, metric, value, unit]);
  // Six months of MRR read from a Stripe export.
  const monthly = [["2026-06", 95000], ["2026-07", 98000], ["2026-08", 97000], ["2026-09", 101000], ["2026-10", 104000], ["2026-11", 108000]].map(([month, mrr]) => ({ month, mrr }));
  await db.query("insert into documents (company_id, doc_type, blob_url, filename, mime, size, status, analysis) values ($1, 'other', 'e2e://none', 'Subscription_metrics_-_monthly_2026-06-01_to_2026-11-30.csv', 'text/csv', 1, 'done', $2)", [company, JSON.stringify({ metrics: [], monthly, warnings: [] })]);
  await db.end();

  const as = async (email: string) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
    return { ctx, page: await ctx.newPage() };
  };

  // --- Advisor: start a project, share its plan and documents, add a result and this week's priorities ---
  const a = await as("fv-admin@e2e.test");
  await a.page.goto(`/advisor/companies/${company}`);
  await a.page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Growth Projects" }).click();
  await expect(a.page).toHaveURL(new RegExp(`/advisor/companies/${company}/projects$`));
  const create = a.page.getByRole("form", { name: "New growth project" });
  await create.getByLabel("Name").fill("Growth Hiring Plan");
  await create.getByLabel("Started").fill("2026-11-11");
  await create.getByRole("button", { name: "Create project" }).click();
  const project = a.page.getByRole("region", { name: "Project: Growth Hiring Plan" });
  await expect(project).toBeVisible();
  const planLink = project.getByRole("form", { name: "Action plan link for Growth Hiring Plan" });
  await planLink.getByLabel("Action plan link").fill("http://docs.example.com/plan");
  await planLink.getByRole("button", { name: "Add link" }).click();
  await expect(planLink.getByRole("alert")).toContainText("Use an https:// link.");
  await planLink.getByLabel("Action plan link").fill("https://docs.google.com/document/d/e2e-plan");
  await planLink.getByLabel("Action plan title").fill("Hiring plan: first AE");
  await planLink.getByRole("button", { name: "Add link" }).click();
  await expect(project.getByRole("link", { name: "Hiring plan: first AE" })).toHaveAttribute("href", "https://docs.google.com/document/d/e2e-plan");
  const docLink = project.getByRole("form", { name: "Document link for Growth Hiring Plan" });
  await docLink.getByLabel("Document link").fill("https://docs.google.com/spreadsheets/d/e2e-comp");
  await docLink.getByLabel("Document title").fill("AE comp model");
  await docLink.getByRole("button", { name: "Add link" }).click();
  await expect(project.getByRole("list", { name: "Documents of Growth Hiring Plan" })).toContainText("AE comp model");
  const newResult = project.getByRole("form", { name: "New result for Growth Hiring Plan" });
  await newResult.getByLabel("New result", { exact: true }).fill("Pipeline created by the new hire");
  await newResult.getByLabel("New result value").fill("$240,000");
  await newResult.getByRole("button", { name: "Add result" }).click();
  await expect(project.getByRole("list", { name: "Results of Growth Hiring Plan" })).toContainText("Draft: not shown");
  const week = a.page.getByRole("form", { name: "This week's priorities" });
  await week.getByLabel("Priority 1", { exact: true }).fill("Close the AE hire");
  await week.getByLabel("Priority 1 action").fill("Send the offer to the final candidate and agree a start date");
  await week.getByRole("button", { name: "Save this week's priorities" }).click();
  await expect(week.getByRole("status")).toContainText("Saved");

  // --- Founder: the Overview is an executive dashboard ---
  const f = await as("fv@e2e.test");
  await f.page.goto("/overview");
  await expect(f.page.getByRole("navigation", { name: "Menu" }).getByRole("link")).toHaveText(["New conversation", "Home", "Rally Collective & CROs", "Decisions", "Company Details", "Team", "Overview", "Growth Projects", "Data", "Performance", "Documents", "Share feedback"]);
  const plans = f.page.getByRole("article", { name: "Growth Hiring Plan" });
  await expect(plans.getByRole("link", { name: "Review Action Plan: Growth Hiring Plan" })).toHaveAttribute("href", "https://docs.google.com/document/d/e2e-plan");
  await expect(plans.getByRole("link", { name: "AE comp model" })).toHaveAttribute("href", "https://docs.google.com/spreadsheets/d/e2e-comp");
  // Exactly four numbers: ARR, NRR, Sales Cycle, MoM Growth.
  const metrics = f.page.getByRole("region", { name: "Business metrics" }).or(f.page.locator("section", { has: f.page.getByRole("heading", { name: "Business metrics" }) }));
  for (const label of ["ARR", "NRR", "Sales Cycle", "MoM Growth"]) await expect(metrics.getByText(label, { exact: true }).first()).toBeVisible();
  await expect(metrics.getByText("Customers", { exact: true })).toHaveCount(0);
  // Six months of MRR: month by MRR, with the change each month.
  const mrr = f.page.getByRole("figure", { name: "Monthly recurring revenue, last six months" });
  await expect(mrr).toContainText("$95,000 → $108,000");
  for (const m of ["Jun 26", "Nov 26"]) await expect(mrr).toContainText(m);
  await expect(mrr).toContainText("▼ -1.0%");
  await expect(mrr).toContainText("▲ +3.8%");
  // This week's priorities, from the advisor.
  const priorities = f.page.getByRole("list", { name: "Top priorities" });
  await expect(priorities).toContainText("Close the AE hire");
  await expect(priorities).toContainText("Next 7 days: Send the offer to the final candidate and agree a start date");
  await expect(f.page.getByRole("heading", { name: "Company Benchmark Performance" })).toBeVisible();
  // Nothing to manage: no founder inputs or task boards.
  await expect(f.page.getByText(/Answer this|Not started|Your hiring numbers/)).toHaveCount(0);

  // --- Growth Projects: a history; the project shows only approved results ---
  await f.page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Growth Projects" }).click();
  const history = f.page.getByRole("list", { name: "Growth project history" });
  await expect(history).toContainText("Growth Hiring Plan");
  await expect(history).toContainText("Status: Open");
  await expect(history).toContainText("Started: November 11, 2026");
  await history.getByRole("link", { name: /Growth Hiring Plan/ }).click();
  await expect(f.page.getByRole("link", { name: "Review Action Plan: Growth Hiring Plan" })).toBeVisible();
  await expect(f.page.getByText("Results appear here once your advisor has reviewed and approved them.")).toBeVisible();
  await expect(f.page.getByText("$240,000")).toHaveCount(0);
  const projectUrl = f.page.url();

  // The advisor approves the result and completes the project.
  await project.getByRole("button", { name: "Approve Pipeline created by the new hire" }).click();
  await expect(project.getByRole("list", { name: "Results of Growth Hiring Plan" })).toContainText("Approved: the founder sees it");
  const edit = project.getByRole("form", { name: "Edit Growth Hiring Plan" });
  await edit.getByLabel("Status").selectOption("completed");
  await edit.getByLabel("Completed", { exact: true }).fill("2026-11-14");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(project).toContainText("Completed · started Nov 11, 2026 · completed Nov 14, 2026");

  await f.page.goto(projectUrl);
  await expect(f.page.getByText("Pipeline created by the new hire")).toBeVisible();
  await expect(f.page.getByText("$240,000")).toBeVisible();
  await f.page.goto("/projects");
  await expect(history).toContainText("Status: Completed");
  await expect(history).toContainText("Completed: November 14, 2026");

  // --- Old Results and Action plan pages land on Growth Projects ---
  for (const old of ["/progress", "/baseline", "/library"]) {
    await f.page.goto(old);
    await expect(f.page, old).toHaveURL(/\/projects$/);
  }

  // --- Data: one shared place, CRM and billing; the Stripe export counts as shared ---
  await f.page.goto("/data");
  await expect(f.page.getByRole("heading", { name: "CRM data" })).toBeVisible();
  const billing = f.page.getByRole("list", { name: "Billing and financial data" });
  await expect(billing.getByRole("listitem").filter({ hasText: "Stripe" })).toContainText("Last updated");
  await expect(f.page.getByRole("list", { name: "CRM data" }).getByRole("listitem").filter({ hasText: "Won deals" })).toContainText("Not shared yet");
  await expect(f.page.getByText(/Re-?run/i)).toHaveCount(0);

  // --- Performance: company performance only ---
  await f.page.goto("/performance");
  await expect(f.page.getByRole("heading", { name: "Action plan progress" })).toHaveCount(0);
  await expect(f.page.getByRole("figure", { name: "Monthly recurring revenue, last six months" })).toBeVisible();

  await f.ctx.close();
  await a.ctx.close();
});
