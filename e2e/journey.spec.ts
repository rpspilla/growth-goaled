import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * Phase 1 journey: founder signs up → company profile → data readiness →
 * hand-off; advisor sets up an approved cohort, claims the company, approves
 * and publishes the Benchmark; founder sees it. Model calls are stubbed.
 */

const FOUNDER = "founder@e2e.test";
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

const VALUES: Record<string, string> = {
  "intake-arr": "4200000",
  "intake-growth": "72",
  "intake-employees": "38",
  "intake-count": "87",
  "intake-acv": "42000",
  "intake-nrr": "108",
  "intake-sales_reps": "5",
};
const SELECTS: Record<string, string> = { "intake-stage": "Series A", "intake-model": "Founder-led" };

async function fillSection(page: Page) {
  const fields = page.locator("form [id^=intake-], div [id^=intake-]");
  const n = await fields.count();
  for (let i = 0; i < n; i++) {
    const f = fields.nth(i);
    const id = (await f.getAttribute("id"))!;
    const tag = await f.evaluate((el) => el.tagName);
    if (await f.inputValue()) continue; // already answered (e.g. company name from sign-up)
    if (tag === "SELECT") {
      const options = await f.locator("option").allTextContents();
      await f.selectOption(SELECTS[id] ?? options[1]!);
    } else {
      const numeric = (await f.getAttribute("inputmode")) === "decimal";
      await f.fill(VALUES[id] ?? (numeric ? "3" : "E2E test answer"));
      await f.blur();
    }
    await expect(page.locator(`label[for="${id}"]`)).toContainText("✓");
  }
}

test("founder to published benchmark", async ({ browser }) => {
  // --- Advisor: a cohort with approved benchmark rows ---
  const admin = await as(browser, ADMIN);
  await admin.page.goto("/advisor/benchmarks");
  await admin.page.locator("form", { hasText: "New cohort" }).getByLabel("Name").fill("E2E Series A founder-led");
  await admin.page.getByLabel("Stages (comma separated)").fill("Series A");
  await admin.page.getByLabel("ARR min").fill("2M");
  await admin.page.getByLabel("ARR max").fill("10M");
  await admin.page.getByLabel("GTM motion").fill("Founder-led");
  await admin.page.getByRole("button", { name: "Create cohort" }).click();
  await expect(admin.page).toHaveURL(/cohort=/);
  await admin.page.locator('input[type=file][name=file]').setInputFiles({
    name: "bench.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("metric,p25,median,top_quartile,sample_size,period\narr_growth,35,58,89,40,2026\nnrr,95,104,119,40,2026\nacv,20000,35000,60000,40,2026\n"),
  });
  await admin.page.getByPlaceholder("Source name, e.g. Portfolio survey Q3 2026").fill("E2E advisory survey");
  await admin.page.getByRole("button", { name: "Import as proposed" }).click();
  await expect(admin.page.getByText("Imported 3 rows as proposed")).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await admin.page.getByRole("button", { name: "Approve", exact: true }).first().click();
    await expect(admin.page.getByRole("heading", { name: /Approved \(used by agents\) · /i })).toContainText(String(i + 1));
  }

  // --- Founder: sign up and company profile ---
  const founder = await as(browser, FOUNDER);
  await founder.page.goto("/dashboard");
  await expect(founder.page).toHaveURL(/\/welcome/);
  await founder.page.locator("#name").fill("Maya Founder");
  await founder.page.locator("#title").fill("CEO");
  await founder.page.locator("#companyName").fill("E2E Analytics");
  await founder.page.locator("#website").fill("e2e-analytics.test");
  await founder.page.locator("#revenueBand").selectOption("3m_10m");
  await founder.page.getByRole("button", { name: "Start Your Growth Profile" }).click();
  await expect(founder.page).toHaveURL(/\/dashboard/);

  for (const section of ["company", "customers", "gtm", "icp", "hiring"]) {
    await founder.page.goto(`/intake/${section}`);
    await fillSection(founder.page);
  }
  await expect(founder.page.getByRole("link", { name: "Data Readiness →" })).toBeVisible();

  // --- Founder: data readiness ---
  for (const category of ["financial", "customers", "pipeline", "marketing", "product", "team"]) {
    await founder.page.goto(`/readiness/${category}`);
    const groups = founder.page.getByRole("group", { name: /^Status of / });
    const n = await groups.count();
    for (let i = 0; i < n; i++) {
      const button = groups.nth(i).getByRole("button", { name: "Available", exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
  }
  await founder.page.goto("/readiness");
  await expect(founder.page.getByText("100%").first()).toBeVisible();
  await founder.page.getByRole("button", { name: "Send to my advisor for the benchmark" }).click();
  await expect(founder.page).toHaveURL(/\/processing/);
  await expect(founder.page.getByText("Your advisor is reviewing your benchmark")).toBeVisible({ timeout: 90_000 });

  // Nothing is visible to the founder before publishing.
  await founder.page.goto("/benchmark");
  await expect(founder.page.getByText("Your advisor is preparing your full, reviewed benchmark")).toBeVisible();

  // --- Advisor: claim, review, approve, publish ---
  await admin.page.goto("/advisor/unassigned");
  await admin.page.getByRole("button", { name: /Assign|Claim/ }).first().click();
  await admin.page.goto("/advisor/review");
  await admin.page.getByRole("link", { name: /E2E Analytics/ }).first().click();
  await expect(admin.page.getByText("Review now")).toBeVisible();
  await expect(admin.page.getByText("Data consistency")).toBeVisible();
  await admin.page.getByRole("button", { name: "Approve", exact: true }).click();
  await admin.page.getByPlaceholder(/Note for the founder/).fill("Checked against your profile.");
  await admin.page.getByRole("button", { name: "Confirm approval" }).click();
  await admin.page.getByRole("button", { name: "Publish to founder" }).click();
  await expect(admin.page.getByText("Published. The founder can see this version.")).toBeVisible();

  // --- Founder: sees the published benchmark ---
  await founder.page.goto("/benchmark");
  await expect(founder.page.getByText("is the main gap to the top quartile.")).toBeVisible();
  await expect(founder.page.getByRole("heading", { name: "How do you compare?" })).toBeVisible();
  await expect(founder.page.getByText("Checked against your profile.")).toBeVisible();
  await expect(founder.page.getByText("ARR Growth").first()).toBeVisible();

  // --- Advisor portfolio reflects it ---
  await admin.page.goto("/advisor/portfolio");
  await expect(admin.page.getByRole("link", { name: /E2E Analytics/ })).toContainText("Published");

  // --- Analytics picks up the events ---
  await admin.page.goto("/advisor/analytics");
  await expect(admin.page.locator("div", { hasText: /^deliverable_published1$/ }).first()).toBeVisible();
  await expect(admin.page.getByText("Sign-up to first Benchmark")).toBeVisible();

  await founder.ctx.close();
  await admin.ctx.close();
});
