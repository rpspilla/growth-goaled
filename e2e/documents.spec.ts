import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * Documents: a founder sees their action plans on top and every file they've shared below; their
 * advisor sees the same under the company. Nobody else can download the files.
 */
test("founder and advisor see the company's documents, plans first", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const a = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('docs-cro@e2e.test','e2e:docs-cro@e2e.test','advisor','Dana CRO', now()) on conflict (auth_user_id) do update set role = 'advisor' returning id");
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('docs@e2e.test','e2e:docs@e2e.test','founder','Dee', now()) on conflict (auth_user_id) do update set name = 'Dee' returning id");
  const c = await db.query("insert into companies (name, revenue_band, stage, advisor_id) values ('Docs Co', '1m_3m', 'Seed', $1) returning id", [a.rows[0].id]);
  const company = c.rows[0].id;
  await db.query("insert into company_members (company_id, user_id) values ($1, $2)", [company, u.rows[0].id]);
  const o = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('docs-other@e2e.test','e2e:docs-other@e2e.test','founder','Oz', now()) on conflict (auth_user_id) do update set name = 'Oz' returning id");
  const oc = await db.query("insert into companies (name, revenue_band, stage) values ('Other Docs Co', '1m_3m', 'Seed') returning id");
  await db.query("insert into company_members (company_id, user_id) values ($1, $2)", [oc.rows[0].id, o.rows[0].id]);

  const conv = await db.query("insert into conversations (company_id, user_id, topic, title) values ($1, $2, 'hiring', 'Should we hire more salespeople?') returning id", [company, u.rows[0].id]);
  const conversation = conv.rows[0].id;
  const plan = await db.query("insert into action_plans (company_id, conversation_id, topic, tier, status, approved_at) values ($1, $2, 'hiring', 'plan', 'delivered', now()) returning id", [company, conversation]);
  const unpaid = await db.query("insert into conversations (company_id, topic, title) values ($1, 'other', 'Unpaid idea') returning id", [company]);
  await db.query("insert into action_plans (company_id, conversation_id, topic, tier) values ($1, $2, 'other', 'plan')", [company, unpaid.rows[0].id]);
  const shared = await db.query("insert into documents (company_id, doc_type, blob_url, filename, mime, size, status, inbox) values ($1, 'other', 'e2e://pipeline.csv', 'pipeline.csv', 'text/csv', 2048, 'done', true) returning id", [company]);
  await db.query("insert into conversation_messages (conversation_id, role, content, document_ids) values ($1, 'user', 'Shared a file: pipeline.csv', $2::jsonb)", [conversation, JSON.stringify([shared.rows[0].id])]);
  await db.query("insert into documents (company_id, doc_type, blob_url, filename, mime, size, status) values ($1, 'financial_model', 'e2e://model.xlsx', 'model.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 3145728, 'failed')", [company]);
  await db.end();

  const as = async (email: string) => {
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
    return { ctx, page: await ctx.newPage() };
  };

  // The founder: Documents in the sidebar, plans on top, then the files.
  const f = await as("docs@e2e.test");
  await f.page.goto("/overview");
  await f.page.getByRole("link", { name: "Documents" }).click();
  await expect(f.page).toHaveURL(/\/documents$/);
  const plans = f.page.getByRole("list", { name: "Action plans" });
  const files = f.page.getByRole("list", { name: "Data and input materials" });
  expect((await plans.boundingBox())!.y).toBeLessThan((await files.boundingBox())!.y);
  await expect(plans.getByRole("listitem")).toHaveCount(1);
  await expect(plans).toContainText("Should we hire more salespeople?");
  await expect(plans).toContainText("Diagnose · Delivered");
  await expect(plans.getByRole("link", { name: "Open plan" })).toHaveAttribute("href", `/chat/${conversation}#your-plan`);
  await expect(files.getByRole("listitem")).toHaveCount(2);
  await expect(files).toContainText("CSV · 2 KB");
  await expect(files.getByRole("link", { name: "Shared in “Should we hire more salespeople?”" })).toHaveAttribute("href", `/chat/${conversation}`);
  await expect(files).toContainText("Spreadsheet · 3.0 MB");
  await expect(files).toContainText("Data step");
  await expect(files).toContainText("Couldn't be read");
  await expect(files.getByRole("link", { name: "Download pipeline.csv" })).toHaveAttribute("href", `/api/files/${shared.rows[0].id}`);
  // Test mode has no file storage, so the founder's own download finds nothing to send, but it's theirs.
  expect((await f.page.request.get(`/api/files/${shared.rows[0].id}`)).status()).toBe(404);
  await f.ctx.close();

  // Another founder can't reach the file (same answer as a missing one).
  const other = await as("docs-other@e2e.test");
  const res = await other.page.request.get(`/api/files/${shared.rows[0].id}`);
  expect(res.status()).toBe(404);
  expect(await res.text()).toBe("Not found");
  await other.page.goto("/documents");
  await expect(other.page.getByText("pipeline.csv")).toHaveCount(0);
  await other.ctx.close();

  // The advisor sees the same under the company.
  const adv = await as("docs-cro@e2e.test");
  await adv.page.goto(`/advisor/companies/${company}`);
  await adv.page.getByRole("link", { name: "Documents" }).click();
  await expect(adv.page).toHaveURL(new RegExp(`/advisor/companies/${company}/documents$`));
  await expect(adv.page.getByRole("list", { name: "Action plans" }).getByRole("link", { name: "Open plan" })).toHaveAttribute("href", `/advisor/plans/${plan.rows[0].id}`);
  await expect(adv.page.getByRole("list", { name: "Data and input materials" }).getByRole("listitem")).toHaveCount(2);
  await expect(adv.page.getByText("Shared in “Should we hire more salespeople?”")).toBeVisible();
  await adv.ctx.close();
});
