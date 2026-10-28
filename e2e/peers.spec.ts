import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../lib/db/schema";
import { ensureStandardReference } from "../lib/benchmark-library/ensure-reference";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * A company no published peer data fits: the Snapshot still compares growth, churn and revenue,
 * using Growth Goaled's standard reference from the Benchmark Library, labelled an assumption.
 */
test("the Snapshot falls back to the standard reference for growth, churn and revenue", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await ensureStandardReference(drizzle(db, { schema }) as never);
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('peers@e2e.test','e2e:peers@e2e.test','founder','Pat', now()) on conflict (auth_user_id) do update set name = 'Pat' returning id");
  const c = await db.query("insert into companies (name, revenue_band) values ('Peerless Health', '1m_3m') returning id");
  await db.query("insert into company_members (company_id, user_id) values ($1, $2)", [c.rows[0].id, u.rows[0].id]);
  const answers: [string, string, string][] = [
    ["company", "stage", "Seed"],
    ["company", "founded_year", "2024"],
    ["company", "industry", "HealthTech"],
    ["gtm", "model", "Founder-led"],
    ["company", "growth_range", "50–100%"],
    ["customers", "gross_retention_range", "5–10%"],
  ];
  for (const [section, field, value] of answers) await db.query("insert into intake_responses (company_id, section, field, value) values ($1, $2, $3, $4)", [c.rows[0].id, section, field, JSON.stringify(value)]);
  await db.end();

  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: "peers@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto("/library/growth_leak/snapshot");
  await expect(page.getByRole("heading", { name: "How you compare with peers" })).toBeVisible();

  const growth = page.getByRole("article", { name: "Growth compared with peers" });
  await expect(growth).toContainText("Our comparison sources don't publish growth figures for HealthTech companies founded in 2024 yet. An advisor can confirm this comparison for you later.");
  await expect(growth).toContainText("Standard reference · an assumption");
  await expect(growth).toContainText("Between the median and the top quartile");
  for (const v of ["20–25%", "40–45%", "80–120%", "Elite companies grow 200%+ a year."]) await expect(growth).toContainText(v);

  const churn = page.getByRole("article", { name: "Retention compared with peers" });
  await expect(churn).toContainText("Annual gross revenue churn");
  await expect(churn).toContainText("You: 5–10%");
  for (const v of ["over 20%", "10–12%", "about 5%", "World-class companies lose under 2% a year."]) await expect(churn).toContainText(v);

  const revenue = page.getByRole("article", { name: "Revenue compared with peers" });
  await expect(revenue).toContainText("On that path you'd aim to reach $3M–$9M ARR next year.");
  await expect(revenue).toContainText("Growth Goaled's standard reference (Growth Goaled standard reference: private B2B SaaS, version 1)");
  await ctx.close();
});
