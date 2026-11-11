import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The internal CRM, end to end: staff only; add prospects in seconds; drag them across the board;
 * edit profiles; companies with several contacts; notes, follow-ups and email drafts; search and
 * filters; CSV import; everything still there after a reload.
 */
test("Growth Goaled staff run prospects through the CRM; founders can't reach it", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('crm-admin@e2e.test','e2e:crm-admin@e2e.test','admin','Ryan Admin', now()) on conflict (auth_user_id) do update set role = 'admin'");
  const f = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('crm-founder@e2e.test','e2e:crm-founder@e2e.test','founder','Fay', now()) on conflict (auth_user_id) do update set role = 'founder' returning id");
  const co = await db.query("insert into companies (name, revenue_band) values ('Fay Co', '1m_3m') returning id");
  await db.query("insert into company_members (company_id, user_id) values ($1, $2)", [co.rows[0].id, f.rows[0].id]);
  await db.end();
  const as = async (email: string) => {
    // Wide enough that the first five columns are on screen for dragging.
    const ctx = await browser.newContext({ viewport: { width: 1800, height: 1600 } });
    await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
    return { ctx, page: await ctx.newPage() };
  };

  // Founders can't open it.
  const founder = await as("crm-founder@e2e.test");
  await founder.page.goto("/advisor/crm");
  await expect(founder.page).not.toHaveURL(/\/advisor\/crm/);
  await founder.ctx.close();

  const { ctx, page } = await as("crm-admin@e2e.test");
  await page.goto("/advisor/portfolio");
  await page.getByRole("navigation", { name: "Advisor" }).getByRole("link", { name: "CRM" }).click();
  await expect(page).toHaveURL(/\/advisor\/crm$/);
  const board = page.getByRole("group", { name: "CRM board" });
  for (const col of ["New Prospects", "Researching", "Ready to Contact", "Contacted", "In Conversation", "Opportunity", "Customer / Partner", "Not Now / Archived"]) await expect(board.getByRole("region", { name: col })).toBeVisible();

  // Add a prospect in a few seconds, with a next action.
  const add = async (first: string, last: string, email: string, company: string, next?: string) => {
    await page.getByRole("button", { name: "Add Contact" }).click();
    const dlg = page.getByRole("dialog", { name: "Add a contact" });
    await dlg.getByLabel("First name").fill(first);
    await dlg.getByLabel("Last name").fill(last);
    await dlg.getByLabel("Email").fill(email);
    await dlg.getByLabel("Company").fill(company);
    await dlg.getByRole("combobox", { name: "Type", exact: true }).selectOption("Founder");
    await dlg.getByRole("combobox", { name: "Subtype" }).selectOption("Seed");
    if (next) {
      await dlg.getByLabel("Next action").fill(next);
      await dlg.getByLabel("Due").fill(new Date().toISOString().slice(0, 10));
    }
    await dlg.getByRole("button", { name: "Add contact" }).click();
    await expect(dlg.getByRole("status")).toContainText("Added.");
    await dlg.getByRole("button", { name: "Close" }).click();
  };
  const started = Date.now();
  await add("Ada", "Lovelace", "ada@calc.io", "Calc", "Send introductory email");
  expect(Date.now() - started).toBeLessThan(30_000);
  await add("Charles", "Babbage", "charles@calc.io", "Calc");
  const newCol = board.getByRole("region", { name: "New Prospects" });
  await expect(newCol.getByRole("listitem", { name: "Ada Lovelace" })).toContainText("Calc");
  await expect(newCol.getByRole("listitem", { name: "Ada Lovelace" })).toContainText("Today");
  await expect(newCol.getByRole("listitem", { name: "Charles Babbage" })).toContainText("No next action");

  // The same email can't be added twice.
  await page.getByRole("button", { name: "Add Contact" }).click();
  const dlg = page.getByRole("dialog", { name: "Add a contact" });
  await dlg.getByLabel("First name").fill("Ada again");
  await dlg.getByLabel("Email").fill("ADA@calc.io");
  await dlg.getByRole("button", { name: "Add contact" }).click();
  await expect(dlg.getByRole("alert")).toContainText("Ada Lovelace already has that email.");
  await dlg.getByRole("button", { name: "Close" }).click();

  // Follow-ups show on the dashboard.
  await expect(page.getByRole("group", { name: "My Follow-ups" }).or(page.locator("details[aria-label='My Follow-ups']"))).toContainText("Send introductory email");

  // Drag between columns; it stays there after a reload.
  await newCol.getByRole("listitem", { name: "Ada Lovelace" }).dragTo(board.getByRole("region", { name: "Contacted" }));
  await expect(board.getByRole("region", { name: "Contacted" }).getByRole("listitem", { name: "Ada Lovelace" })).toBeVisible();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(board.getByRole("region", { name: "Contacted" }).getByRole("listitem", { name: "Ada Lovelace" })).toBeVisible();

  // Search and filters.
  await page.getByLabel("Search contacts").fill("babbage");
  await page.getByLabel("Search contacts").press("Enter");
  await expect(board.getByRole("listitem")).toHaveCount(1);
  await expect(board.getByRole("listitem", { name: "Charles Babbage" })).toBeVisible();
  await page.goto("/advisor/crm?followUp=today");
  await expect(board.getByRole("listitem")).toHaveCount(1);
  await expect(board.getByRole("listitem", { name: "Ada Lovelace" })).toBeVisible();
  await page.goto("/advisor/crm");

  // The profile: history, edit, notes, follow-ups, email drafts.
  await board.getByRole("listitem", { name: "Ada Lovelace" }).getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Ada Lovelace", level: 1 })).toBeVisible();
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline).toContainText("Moved from New Prospects to Contacted");
  await page.getByRole("form", { name: "Log an interaction" }).getByRole("combobox", { name: "Kind" }).selectOption("call");
  await page.getByRole("form", { name: "Log an interaction" }).getByLabel("What happened").fill("Intro call: interested in a pilot");
  await page.getByRole("button", { name: "Add to timeline" }).click();
  await expect(timeline).toContainText("Intro call: interested in a pilot");
  const followForm = page.getByRole("form", { name: "Set a follow-up" });
  await followForm.getByLabel("Next action").fill("Send proposal");
  await followForm.getByLabel("Due").fill("2026-12-01");
  await page.getByRole("button", { name: "Set follow-up" }).click();
  await expect(page.getByRole("region", { name: "Follow-ups" })).toContainText("Send proposal");
  await page.getByRole("button", { name: "Complete: Send introductory email" }).click();
  await expect(page.getByRole("region", { name: "Follow-ups" })).not.toContainText("Send introductory email");

  await page.getByRole("link", { name: "Details" }).click();
  const details = page.getByRole("form", { name: "Contact details" });
  await details.getByLabel("Job title").fill("CEO");
  await details.getByRole("combobox", { name: "Opportunity", exact: true }).selectOption("Potential customer");
  await details.getByRole("button", { name: "Save" }).click();
  await expect(details.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(page.getByText("CEO ·")).toBeVisible();
  await expect(page.locator("header").getByText("Potential customer")).toBeVisible();

  await page.getByRole("link", { name: "Email" }).click();
  const compose = page.getByRole("form", { name: "Compose email" });
  await expect(compose).toContainText("ada@calc.io");
  await compose.getByLabel("Subject").fill("Growth Goaled intro");
  await compose.getByLabel("Message").fill("Hi Ada, great speaking today.");
  await compose.getByRole("button", { name: "Save draft" }).click();
  await expect(compose.getByRole("status")).toHaveText("Draft saved.");
  await expect(compose.getByRole("button", { name: /Send/ })).toBeDisabled();
  const emails = page.getByRole("list", { name: "Emails" });
  await expect(emails).toContainText("Draft");
  await expect(emails).toContainText("Growth Goaled intro");
  await emails.getByRole("button", { name: "Edit draft: Growth Goaled intro" }).click();
  await compose.getByLabel("Subject").fill("Growth Goaled intro (v2)");
  await compose.getByRole("button", { name: "Update draft" }).click();
  await expect(emails).toContainText("Growth Goaled intro (v2)");
  await expect(emails.getByRole("listitem")).toHaveCount(1);

  // One company, several contacts.
  await page.getByRole("link", { name: "Calc" }).first().click();
  await expect(page.getByRole("region", { name: "Contacts at this company" })).toContainText("Ada Lovelace");
  await expect(page.getByRole("region", { name: "Contacts at this company" })).toContainText("Charles Babbage");

  // CSV import: new prospects in, existing emails skipped.
  await page.goto("/advisor/crm/import");
  await page.getByLabel("CSV file").setInputFiles({ name: "prospects.csv", mimeType: "text/csv", buffer: Buffer.from("First name,Last name,Email,Company,Category,Source\nGrace,Hopper,grace@navy.mil,Navy,Investor,Event\nAlan,Turing,alan@bletchley.uk,Bletchley,Advisor,LinkedIn\nAda,Lovelace,ada@calc.io,Calc,,\n") });
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 2 contacts into New Prospects.");
  await expect(page.getByRole("status")).toContainText("Skipped 1 already in the CRM");
  await page.goto("/advisor/crm");
  await expect(board.getByRole("region", { name: "New Prospects" }).getByRole("listitem", { name: "Grace Hopper" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Summary" })).toContainText("4");

  // Columns can be renamed and added.
  await page.getByRole("link", { name: "Columns" }).click();
  await page.getByLabel("New column name").fill("Pilot");
  await page.getByRole("button", { name: "Add column" }).click();
  await expect(page.getByRole("list", { name: "Columns" }).getByRole("textbox", { name: "Rename Pilot" })).toBeVisible();
  await page.goto("/advisor/crm");
  await expect(board.getByRole("region", { name: "Pilot" })).toBeVisible();
  await ctx.close();
});
