import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * Evaluations (Nov 24, 2026): an admin replays founder scenarios against the Collective, the page
 * drives the run one scenario at a time, and the scores appear per criterion and per scenario.
 */
test("run an evaluation of the Collective and read its scores", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('eval-admin@e2e.test','e2e:eval-admin@e2e.test','admin','Eva Admin', now()) on conflict (auth_user_id) do update set role = 'admin'");
  await db.end();

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addCookies([{ name: "gg_e2e_user", value: "eval-admin@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto("/advisor/quality");
  await page.getByRole("link", { name: "Evaluations" }).click();
  await expect(page.getByRole("heading", { name: "Evaluations" })).toBeVisible({ timeout: 120_000 });

  const form = page.getByRole("form", { name: "New evaluation run" });
  await form.getByLabel("Who answers").selectOption({ label: "The Rally Collective Brain" });
  await form.getByLabel("Scenarios").selectOption("3");
  await form.getByRole("button", { name: "Start the run" }).click();
  await expect(page.getByRole("heading", { name: "Rally Collective Brain" })).toBeVisible({ timeout: 60_000 });

  const scenarios = page.getByRole("list", { name: "Scenario results" });
  await expect(scenarios.getByRole("listitem").filter({ hasText: "Should we hire two salespeople?" })).toContainText("Scored", { timeout: 90_000 });
  await expect(page.getByText(/^Running: /)).toHaveCount(0, { timeout: 90_000 });
  const table = page.getByRole("table", { name: "Scores by criterion" });
  await expect(table.getByRole("row").filter({ hasText: "Diagnosis" })).toContainText("4 / 5");
  await expect(table.getByRole("row").filter({ hasText: "Recognizes disagreement" })).toContainText("4 / 5");
  await expect(table.getByRole("row").filter({ hasText: "Continuity" })).toContainText("—");
  await scenarios.getByRole("listitem").filter({ hasText: "Should we hire two salespeople?" }).getByText("The answer and its scores").click();
  await expect(scenarios).toContainText("Judge: Test mode: a sound answer.");

  await page.getByRole("link", { name: "← Evaluations" }).click();
  await expect(page.getByRole("list", { name: "Evaluation runs" }).getByRole("listitem").first()).toContainText("4.0 / 5");
  await ctx.close();
});
