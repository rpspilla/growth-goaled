import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The Benchmark Library, end to end: an admin adds a source and dataset, previews and imports a CSV,
 * validates and publishes it, and checks the customer preview card. (The founder's self-serve
 * assessment journey that used to follow was retired with the Founder View redesign, Nov 16, 2026:
 * advisors run growth projects now; see founder-view.spec.ts.)
 */

const ADMIN = "admin@e2e.test";

async function as(browser: Browser, email: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
  return { ctx, page: await ctx.newPage() };
}

test.beforeAll(async () => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query(
    `insert into users (email, auth_user_id, role, name, title, onboarded_at) values ($1, $2, 'admin', 'E2E Admin', 'Advisor', now())
     on conflict (auth_user_id) do update set role = 'admin'`,
    [ADMIN, `e2e:${ADMIN}`],
  );
  await db.end();
});

test("an admin builds and publishes a Benchmark Library dataset", async ({ browser }) => {
  // --- Admin: a Benchmark Library dataset (source → dataset → CSV preview → import → validate → publish) ---
  // Test fixture values, not real benchmarks.
  const admin = await as(browser, ADMIN);
  await admin.page.goto("/advisor/benchmark-library");
  await expect(admin.page.getByRole("heading", { name: "Benchmark Library" })).toBeVisible();
  await admin.page.getByRole("link", { name: /^Sources/ }).click();
  await admin.page.getByRole("link", { name: "Add a source" }).click();
  await admin.page.getByLabel("Source name").fill("E2E advisory survey");
  await admin.page.getByLabel("Publisher").fill("E2E Research");
  await admin.page.getByLabel("Publication date").fill("2026-01-15");
  await admin.page.getByLabel("Reliability").selectOption("reliable");
  await admin.page.getByLabel(/allows showing these values in customer reports/).check();
  await admin.page.getByLabel(/allows derived figures/).check();
  await admin.page.getByLabel(/Use for Snapshot peer comparisons/).check();
  await admin.page.getByRole("button", { name: "Add source" }).click();
  await expect(admin.page.getByRole("article").filter({ hasText: "E2E advisory survey" })).toContainText("Customer display: allowed");

  await admin.page.goto("/advisor/benchmark-library/new");
  await admin.page.getByLabel("Dataset name").fill("E2E Series A retention");
  await admin.page.locator('select[name="sourceId"]').selectOption({ label: "E2E advisory survey · E2E Research" });
  await admin.page.getByRole("button", { name: "Create dataset" }).click();
  await expect(admin.page.getByRole("heading", { name: "E2E Series A retention" })).toBeVisible();
  await admin.page.getByRole("link", { name: "Import CSV" }).click();
  await admin.page.getByLabel("CSV file").setInputFiles({
    name: "bench.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "metric,definition,definition_matches,unit,statistic,percentile,value,stages,arr_min,arr_max,industry,founded_from,founded_to,period,period_basis,cohort_definition,sample_size\n" +
        "nrr,ARR from customers a year ago ÷ their ARR then,yes,percent,median,,104,Series A,2M,10M,,,,FY2025,annual,E2E Series A cohort,40\n" +
        "nrr,ARR from customers a year ago ÷ their ARR then,yes,percent,percentile,75,119,Series A,2M,10M,,,,FY2025,annual,E2E Series A cohort,40\n" +
        "nrr,ARR from customers a year ago ÷ their ARR then,yes,dollars,median,,90,Series A,2M,10M,,,,FY2024,annual,E2E Series A cohort,40\n" +
        // Peers by industry and founding year, for the free Snapshot (no growth rows: that comparison stays unavailable).
        "nrr,ARR from customers a year ago ÷ their ARR then,yes,percent,percentile,25,88,,,,Fintech,2017,2021,FY2025,annual,E2E fintech founded 2017-2021,30\n" +
        "nrr,ARR from customers a year ago ÷ their ARR then,yes,percent,median,,100,,,,Fintech,2017,2021,FY2025,annual,E2E fintech founded 2017-2021,30\n" +
        "nrr,ARR from customers a year ago ÷ their ARR then,yes,percent,percentile,75,112,,,,Fintech,2017,2021,FY2025,annual,E2E fintech founded 2017-2021,30\n" +
        "arr,Annual recurring revenue at year end,yes,usd,percentile,25,1M,,,,Fintech,2017,2021,FY2025,point_in_time,E2E fintech founded 2017-2021,30\n" +
        "arr,Annual recurring revenue at year end,yes,usd,median,,3M,,,,Fintech,2017,2021,FY2025,point_in_time,E2E fintech founded 2017-2021,30\n" +
        "arr,Annual recurring revenue at year end,yes,usd,percentile,75,8M,,,,Fintech,2017,2021,FY2025,point_in_time,E2E fintech founded 2017-2021,30\n" +
        // A stage-wide top quartile only: the Snapshot's growth target when no peer cohort fits.
        "arr_growth,Year-over-year ARR growth,yes,percent,percentile,75,150,Series A,,,,,,FY2025,annual,E2E Series A growth,50\n",
    ),
  });
  await admin.page.getByRole("button", { name: "Preview" }).click();
  await expect(admin.page.getByText("10 rows: 9 will be imported, 1 rejected")).toBeVisible();
  await expect(admin.page.getByText(/Unknown unit "dollars"/)).toBeVisible();
  await admin.page.getByRole("button", { name: /^Import 9 to draft version 1/ }).click();
  await admin.page.getByRole("link", { name: "Review the draft →" }).click();
  await expect(admin.page.getByText("No validation errors.")).toBeVisible();
  await admin.page.getByRole("button", { name: "Validate" }).click();
  await expect(admin.page.getByText("Validated: ready to publish.")).toBeVisible();
  await admin.page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(admin.page.getByText("Version 1 published")).toBeVisible();
  // The customer preview uses the same card as reports.
  await admin.page.locator("select").filter({ hasText: "NRR · Series A" }).selectOption({ label: "NRR · Series A · ARR $2M–$10M · FY2025" });
  await admin.page.getByPlaceholder("e.g. 94").fill("94");
  await expect(admin.page.getByRole("article", { name: "NRR benchmark comparison" })).toContainText("10 pts below");

  await admin.ctx.close();
});
