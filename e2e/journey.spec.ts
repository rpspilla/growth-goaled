import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * Founder signs up → Overview → explores the library for free → answers the
 * questionnaire → free Growth Snapshot (no charge) → buys the $149 assessment
 * (fake Stripe in test mode) → Data → analysis; the advisor sees the same steps,
 * grants a pilot, approves and publishes; the founder reads the results, sees
 * the optional advisory offer once, requests a session, and finds both
 * assessments in their history. Models are stubbed.
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
  "intake-nrr": "94",
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

test("founder: free snapshot, $149 assessment, results, optional advisory", async ({ browser }) => {
  // The longest journey: it also builds a Benchmark Library dataset, and dev mode compiles each page on first visit.
  test.setTimeout(480_000);
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

  // --- Founder: sign up and company profile ---
  const founder = await as(browser, FOUNDER);
  await founder.page.goto("/overview");
  await expect(founder.page).toHaveURL(/\/welcome/);
  await founder.page.locator("#name").fill("Maya Founder");
  await founder.page.locator("#title").fill("CEO");
  await founder.page.locator("#companyName").fill("E2E Analytics");
  await founder.page.locator("#website").fill("e2e-analytics.test");
  await founder.page.locator("#revenueBand").selectOption("3m_10m");
  await founder.page.getByRole("button", { name: "Continue to growth questions" }).click();
  // Straight to the first real step, with a progress cue.
  await expect(founder.page).toHaveURL(/\/library\?welcome=1$/);
  await expect(founder.page.getByText(/You're set up, E2E Analytics\. Last step: pick a question\./)).toBeVisible();
  // The Command Center points to the same first step.
  await founder.page.goto("/overview");

  // --- Founder: Overview → Library → questionnaire → free Snapshot → $149 purchase → Data ---
  const steps = founder.page.getByRole("navigation", { name: "Steps" });
  await expect(steps.getByText("Unlocks when you buy an assessment").first()).toBeVisible();
  await expect(steps.getByRole("link", { name: /Data/ })).toHaveCount(0);
  await founder.page.getByRole("link", { name: "Pick a question to answer →" }).click();
  await expect(founder.page).toHaveURL(/\/library$/);
  const leakCard = founder.page.locator("article", { has: founder.page.getByRole("heading", { name: "How do I fix churn?" }) });
  await expect(leakCard).toContainText("Recommended for you");
  await expect(leakCard).toContainText("Snapshot free · Assessment $149");
  // Coming-soon questions are listed but can't be started or bought.
  for (const soon of ["Are we ready to raise a Series A?", "Are we ready to raise a Series B?", "Build me an investor update"]) {
    const card = founder.page.getByRole("article", { name: `${soon} (coming soon)` });
    await expect(card).toContainText("Coming soon");
    await expect(card.getByRole("link")).toHaveCount(0);
  }
  await founder.page.goto("/library/series_a_ready/snapshot");
  await expect(founder.page).toHaveURL(/\/library\/series_a_ready$/);
  await expect(founder.page.getByRole("heading", { name: "Coming soon", exact: true })).toBeVisible();
  await expect(founder.page.getByRole("button")).not.toContainText([/Snapshot|\$149/]);
  await founder.page.goto("/library");
  await leakCard.getByRole("link", { name: /^Start with a free Snapshot/ }).click();
  await expect(founder.page).toHaveURL(/\/library\/growth_leak$/);
  await expect(founder.page.getByLabel("Pricing")).toContainText("$149");
  await expect(founder.page.getByRole("button", { name: /payment|\$149/ })).toHaveCount(0); // selecting is free
  const snapshotButton = founder.page.getByRole("button", { name: "See my free Snapshot" });
  await expect(snapshotButton).toBeDisabled();
  // No free-text challenge, goal or context: just the essentials, with figures as ranges.
  await expect(founder.page.getByLabel(/challenge you're trying to solve|Where do you think the leak is|Your target value|Why now/)).toHaveCount(0);
  // Revenue was given at onboarding, so it isn't asked again.
  await expect(founder.page.getByLabel("Annual recurring revenue (ARR)")).toHaveCount(0);
  const known = founder.page.getByLabel("Already known from your profile");
  await expect(known).toContainText("Annual revenue");
  await expect(known).toContainText("$3M–$10M");
  // One question per step: jump to a question by its dot, then answer it (ranges are big tap targets).
  const goTo = async (label: string) => {
    const dot = founder.page.getByRole("button", { name: new RegExp(`^Question \\d+: ${label.replace(/[()]/g, "\\$&")}`) });
    await dot.click();
    await expect(dot).toHaveAttribute("aria-current", "step");
  };
  const answer = async (label: string, value: string) => {
    await goTo(label);
    const radio = founder.page.getByRole("radio", { name: value, exact: true });
    if (await radio.count()) await radio.check({ force: true });
    else await founder.page.getByLabel(new RegExp(`^${label}`)).selectOption(value);
  };
  await goTo("Year-over-year revenue growth");
  await expect(founder.page.locator("form fieldset label")).toHaveText(["Shrinking", "0–25%", "25–50%", "50–100%", "100–200%", "200%+"]);
  await goTo("Number of employees");
  await expect(founder.page.locator("form fieldset label")).toHaveText(["1–5", "6–10", "11–25", "26–50", "50+"]);
  await answer("Stage", "Series A");
  await answer("Sales model", "Founder-led");
  await expect(founder.page.getByRole("button", { name: "See my free Snapshot" })).toBeDisabled(); // founding year is required
  await answer("Founding year", "2019");
  await answer("Industry", "Fintech");
  await answer("Year-over-year revenue growth", "50–100%");
  await answer("Net revenue retention (NRR)", "90–100%");
  await answer("Number of employees", "26–50");
  await expect(founder.page.getByText("Your answers are saved.")).toBeVisible();
  // Answers survive a reload (autosave), and show as known instead of being asked again.
  await founder.page.reload();
  await expect(known).toContainText("Series A");
  await expect(known).toContainText("Net revenue retention (NRR)");
  await expect(known).toContainText("90–100%");
  await expect(founder.page.getByRole("button", { name: /^Question \d+: Stage/ })).toHaveCount(0);
  await expect(founder.page.getByRole("button", { name: /^Question \d+: Number of employees/ })).toHaveCount(0);
  await snapshotButton.click();
  await expect(founder.page).toHaveURL(/\/library\/growth_leak\/snapshot$/);
  await expect(founder.page.getByText("Hypotheses", { exact: true })).toBeVisible();
  await expect(founder.page.getByText("Your existing customers shrink on net")).toBeVisible();
  await expect(founder.page.getByText("Based on: Your answer: NRR 90–100%")).toBeVisible();
  // Peer comparisons: the same fixed sources, the founder's industry and founding year, and plain words when there's nothing to compare.
  await expect(founder.page.getByRole("heading", { name: "How you compare with peers" })).toBeVisible();
  const retention = founder.page.getByRole("article", { name: "Retention compared with peers" });
  await expect(retention).toContainText("Between the bottom quartile and the median");
  await expect(retention).toContainText("You: 90–100%");
  await expect(retention).toContainText("Fintech · founded 2017–2021");
  await expect(retention).toContainText("E2E advisory survey");
  const revenue = founder.page.getByRole("article", { name: "Revenue compared with peers" });
  await expect(revenue).toContainText("$3M");
  await expect(revenue).toContainText("the revenue band you gave at sign-up");
  const growth = founder.page.getByRole("article", { name: "Growth compared with peers" });
  await expect(growth).toContainText("Our comparison sources don't publish growth figures for Fintech companies founded in 2019 yet. An advisor can confirm this comparison for you later.");
  await expect(growth).toContainText("Based on publicly available data from E2E advisory survey (2026), a Series A company should be targeting 150% year-over-year ARR growth or more to be in the top quartile.");
  await expect(growth).toContainText("At 50–100%, you're below it.");
  // How we work with companies like this one, and what we'd do after the assessment.
  await expect(founder.page.getByRole("heading", { name: "How we work with companies like yours" })).toBeVisible();
  await founder.page.getByRole("heading", { name: "How we work with companies like yours" }).click(); // collapsed by default
  await expect(founder.page.getByText(/^Series A .*companies.*with founder-led sales/)).toBeVisible();
  await expect(founder.page.getByText("If the assessment confirms that existing customers are where growth is leaking, we'd:")).toBeVisible();
  // Nothing has been charged or unlocked so far.
  {
    const db = new Client({ connectionString: E2E_DATABASE_URL });
    await db.connect();
    expect((await db.query("select count(*)::int as n from payments")).rows[0].n).toBe(0);
    await db.end();
  }
  await expect(steps.getByRole("link", { name: /Data/ })).toHaveCount(0);
  await founder.page.getByRole("button", { name: "Get the full assessment · $149" }).click();
  await expect(founder.page).toHaveURL(/\/data\?checkout=success/);
  await expect(founder.page.getByRole("heading", { name: "Data for Fix Churn" })).toBeVisible();
  await expect(steps.getByRole("link", { name: /Data/ })).toBeVisible();
  {
    const db = new Client({ connectionString: E2E_DATABASE_URL });
    await db.connect();
    const { rows } = await db.query("select amount_cents, status, use_case, purpose from payments");
    expect(rows).toEqual([{ amount_cents: 14900, status: "paid", use_case: "growth_leak", purpose: "assessment" }]);
    await db.end();
  }
  // Buying again is refused rather than charged twice.
  await founder.page.goto("/library/growth_leak/snapshot");
  await expect(founder.page.getByRole("link", { name: /You have this assessment/ })).toBeVisible();
  await expect(founder.page.getByRole("button", { name: /Get the full assessment/ })).toHaveCount(0);
  await founder.page.goto("/overview");
  await expect(founder.page.getByText("Sharing data", { exact: true })).toBeVisible();

  for (const section of ["company", "customers", "gtm", "icp", "hiring"]) {
    await founder.page.goto(`/profile/${section}`);
    await fillSection(founder.page);
  }
  await expect(founder.page.getByRole("link", { name: "Go to Data →" })).toBeVisible();

  // --- Founder: Data shows only Fix Churn's items, in priority order ---
  await founder.page.goto("/data");
  await expect(founder.page.getByRole("heading", { name: "Data for Fix Churn" })).toBeVisible();
  await expect(founder.page.getByText(/benchmark/i)).toHaveCount(0);
  await expect(founder.page.getByRole("heading", { name: "Needed for the assessment (3)" })).toBeVisible();
  await founder.page.getByRole("button", { name: "Details" }).first().click(); // description and why sit behind Details
  await expect(founder.page.getByText("Why it matters:").first()).toBeVisible();
  await expect(founder.page.getByText("0 of 3 required items in")).toBeVisible();
  // Analysis is never blocked: with data missing it runs on what's shared and lists the gaps.
  // Upload and the big run button sit at the top of every Data page.
  for (const path of ["/data/files", "/data/questions", "/data"]) {
    await founder.page.goto(path);
    await expect(founder.page.getByLabel("Upload files: drop them here or press to choose")).toBeVisible();
    await expect(founder.page.getByRole("button", { name: "Run my report", exact: true })).toBeEnabled();
  }
  const build = founder.page.getByRole("button", { name: "Run my report", exact: true });
  const groups = founder.page.getByRole("group", { name: /^Status of / });
  await expect(groups).toHaveCount(15); // 3 required + 6 helpful + 6 optional
  for (let i = 0; i < 3; i++) {
    const button = groups.nth(i).getByRole("button", { name: "Available", exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await expect(founder.page.getByText("Ready: everything the assessment needs is in.")).toBeVisible();
  // Fewer than 3 recorded sales calls would hold the report for an advisor; this founder shares three.
  await expect(founder.page.getByText("Recorded sales calls: 0 of 3.")).toBeVisible();
  {
    const db = new Client({ connectionString: E2E_DATABASE_URL });
    await db.connect();
    const { rows } = await db.query("select id from companies where name = 'E2E Analytics'");
    for (let i = 1; i <= 3; i++)
      await db.query("insert into documents (company_id, doc_type, blob_url, filename, mime, size, status, data_item_keys) values ($1, 'other', $2, $3, 'audio/mpeg', 1, 'done', '{sales_calls}')", [rows[0].id, `e2e://call-${i}`, `discovery-call-${i}.mp3`]);
    await db.end();
  }
  await founder.page.reload();
  await expect(founder.page.getByText("Recorded sales calls: 3 of 3.")).toBeVisible();
  await build.click();
  await expect(founder.page).toHaveURL(/\/baseline/);

  // --- Founder: self-service results, built from their answers and data ---
  await expect(founder.page.getByRole("region", { name: "The answer" })).toBeVisible({ timeout: 90_000 });
  await expect(founder.page.getByRole("heading", { name: "How do I fix churn?" })).toBeVisible();
  // The answer, the signature charts (or Needs data tiles), each plan area with the data behind it, then the plan.
  await expect(founder.page.getByRole("region", { name: /ARR bridge/ })).toBeVisible();
  for (const dim of ["Churn and at-risk accounts", "Onboarding and adoption", "Expansion", "Sales call reviews"]) {
    const section = founder.page.getByRole("region", { name: dim, exact: true });
    await expect(section).toBeVisible();
    await expect(section.locator("summary", { hasText: /^›?\s*Data behind this/ })).toBeVisible();
  }
  for (const stage of ["Now", "Next", "Later"]) await expect(founder.page.getByRole("heading", { name: stage, exact: true })).toBeVisible();
  const calls = founder.page.getByRole("region", { name: "Sales call reviews", exact: true });
  await calls.locator("summary", { hasText: "Data behind this" }).click();
  await expect(calls.getByRole("link", { name: "Update Recorded sales calls" })).toHaveAttribute("href", "/data#item-sales_calls");
  await expect(founder.page.getByRole("heading", { name: "Explore the details", exact: true })).toBeVisible();
  for (const detail of ["Options considered", "What would change this recommendation", "Follow-up and when to reassess", "Assumptions, gaps and method"]) {
    await expect(founder.page.locator("summary", { hasText: detail })).toBeVisible();
  }
  await expect(founder.page.getByText(/Every statement checked against your inputs/)).toBeVisible();
  // Peer comparisons live on the Overview; the assessment links to them.
  await expect(founder.page.getByRole("heading", { name: "How you compare with peers" })).toHaveCount(0);
  await expect(founder.page.getByRole("link", { name: /See how you compare with peers/ })).toHaveAttribute("href", "/overview#peers");
  await founder.page.getByRole("link", { name: /See how you compare with peers/ }).click();
  await expect(founder.page).toHaveURL(/\/overview#peers/);
  await expect(founder.page.getByRole("heading", { name: "How you compare with peers" })).toBeVisible();
  await expect(founder.page.getByRole("article", { name: "Retention compared with peers" })).toContainText("Fintech · founded 2017–2021");
  await founder.page.goto("/baseline");
  await expect(founder.page.getByText("Test mode brief: How do I fix churn?")).toBeVisible();
  // Benchmark comparison from the library: observed, benchmark, derived and interpretation, with the source.
  await founder.page.locator("summary", { hasText: "Against published benchmarks" }).click();
  const nrrCard = founder.page.getByRole("article", { name: "NRR benchmark comparison" });
  await expect(nrrCard).toContainText("Observed");
  await expect(nrrCard).toContainText("median 104%");
  await expect(nrrCard).toContainText("10 pts below");
  await expect(nrrCard).toContainText("E2E advisory survey");
  await expect(nrrCard).toContainText("E2E Series A retention, version 1");
  await expect(founder.page.getByText(/Build a growth hiring plan/)).toBeVisible();
  await founder.page.getByRole("button", { name: "Evidence →" }).first().click();
  await expect(founder.page.getByRole("dialog", { name: "Sources" })).toContainText("Checked in code against your inputs.");
  await founder.page.getByRole("button", { name: "Close" }).click();

  // --- Founder: commits to the plan and tracks it on Progress ---
  await founder.page.getByRole("button", { name: "Commit to this plan" }).click();
  await expect(founder.page.getByText(/You committed to this plan on/)).toBeVisible();
  await founder.page.getByRole("link", { name: "Track progress →" }).click();
  await expect(founder.page.getByRole("heading", { name: "Action plan", exact: true })).toBeVisible();
  // One staged action per dimension at least.
  const planHeading = founder.page.getByRole("heading", { name: /Plan · 0 of \d+ done/ });
  await expect(planHeading).toBeVisible();
  const total = Number((await planHeading.textContent())!.match(/of (\d+) done/)![1]);
  expect(total).toBeGreaterThanOrEqual(4);
  await founder.page.getByLabel("Status").first().selectOption("done");
  await expect(founder.page.getByRole("heading", { name: new RegExp(`Plan · 1 of ${total} done`) })).toBeVisible();
  await expect(founder.page.getByRole("button", { name: "Reassess now" })).toBeVisible();
  await founder.page.goto("/baseline");

  // --- Founder: the profile and an uploaded file disagree; they pick one and add a missing figure ---
  {
    const db = new Client({ connectionString: E2E_DATABASE_URL });
    await db.connect();
    const { rows } = await db.query("select id from companies where name = 'E2E Analytics'");
    const companyId = rows[0].id;
    const doc = await db.query(
      "insert into documents (company_id, doc_type, blob_url, filename, mime, size, status) values ($1, 'other', 'e2e://none', 'board-metrics.xlsx', 'text/csv', 1, 'done') returning id",
      [companyId],
    );
    await db.query("insert into data_points (company_id, metric, value, unit, confidence, status, document_id) values ($1, 'nrr', 101, 'percent', 'medium', 'proposed', $2)", [companyId, doc.rows[0].id]);
    await db.end();
  }
  await founder.page.reload();
  const figures = founder.page.locator("details", { hasText: "Check your figures" });
  await expect(figures).toHaveAttribute("open", "");
  await expect(figures).toContainText("1 disagrees");
  await expect(figures).toContainText("Values disagree");
  await expect(founder.page.getByText(/NRR has different values \(94% in your company profile vs 101% in board-metrics.xlsx\)/)).toHaveCount(0); // gap only appears after a re-run
  await figures.getByRole("button", { name: "Use 101% from board-metrics.xlsx for NRR" }).click();
  await expect(figures.getByText("Figures updated. Re-run the assessment to use them.")).toBeVisible();
  // A figure the assessment needs but nobody has given yet.
  const newArr = figures.locator("li", { hasText: "New ARR" }).first();
  await newArr.getByLabel(/New ARR/).fill("$500K");
  await newArr.getByRole("button", { name: "Save" }).click();
  await expect(newArr.getByText("$500K")).toBeVisible();
  await expect(figures.locator("li", { hasText: "NRR" }).first()).toContainText("Confirmed");
  // The profile follows the choice.
  await founder.page.goto("/profile/customers");
  await expect(founder.page.locator("#intake-nrr")).toHaveValue("101");
  await founder.page.goto("/baseline");
  await founder.page.getByRole("button", { name: "Re-run my report" }).click();
  await expect
    .poll(async () => {
      const db = new Client({ connectionString: E2E_DATABASE_URL });
      await db.connect();
      const { rows } = await db.query("select count(*)::int as n from deliverables where type = 'baseline' and status = 'in_review'");
      await db.end();
      return rows[0].n;
    }, { timeout: 90_000 })
    .toBe(2);

  // --- Advisor: claim; the company shows the founder's five steps ---
  await admin.page.goto("/advisor/unassigned");
  await admin.page.getByRole("button", { name: /Assign|Claim/ }).first().click();
  await admin.page.goto("/advisor/portfolio");
  await admin.page.getByRole("link", { name: /E2E Analytics/ }).first().click();
  const mirrored = admin.page.getByRole("navigation", { name: "Steps" });
  for (const label of ["Overview", "Growth questions", "Data", "Results", "Action plan"]) await expect(mirrored.getByRole("link", { name: label })).toBeVisible();
  await expect(admin.page.getByText(/Purchased .* · paid/)).toBeVisible();
  // The advisor can see the same results with the QA checks, and mark them reviewed.
  await mirrored.getByRole("link", { name: "Results" }).click();
  await expect(admin.page.getByText("Visible to the founder")).toBeVisible();
  await expect(admin.page.getByText(/✓ Data consistency/)).toBeVisible();
  await admin.page.getByLabel("Note for the founder").fill("Checked against your profile.");
  await admin.page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(admin.page.getByText("Reviewed", { exact: true })).toBeVisible();
  await mirrored.getByRole("link", { name: "Growth questions" }).click();
  // Pilot: grant an assessment without payment, recorded with a note.
  await admin.page.locator("section", { hasText: "Repeatable Sales Motion" }).getByPlaceholder("Why (e.g. pilot customer)").fill("E2E pilot");
  await admin.page.locator("section", { hasText: "Repeatable Sales Motion" }).getByRole("button", { name: "Grant without payment" }).click();
  await expect(admin.page.getByText(/Granted without payment by E2E Admin .* · E2E pilot/)).toBeVisible();

  // --- Founder: the switcher follows the granted assessment; results now show as reviewed ---
  await founder.page.goto("/data");
  const switcher = founder.page.getByRole("combobox", { name: "Active question" });
  await switcher.selectOption("winning_icp");
  await expect(founder.page.getByRole("heading", { name: "Data for Repeatable Sales Motion" })).toBeVisible();
  await switcher.selectOption("growth_leak");
  await expect(founder.page.getByRole("heading", { name: "Data for Fix Churn" })).toBeVisible();
  await expect(founder.page.getByRole("link", { name: "View your latest results →" })).toBeVisible();
  await expect(founder.page.getByRole("button", { name: "Re-run my report", exact: true })).toBeVisible();
  await founder.page.goto("/baseline");
  await expect(founder.page.getByText(/Reviewed by E2E Admin/)).toBeVisible();
  await expect(founder.page.getByText(/Checked against your profile\./)).toBeVisible();

  // --- Complete data: a clear plan and a monthly executive advisor call, shown once ---
  await expect(founder.page.getByRole("link", { name: "Book your monthly call →" })).toHaveCount(1);
  await expect(founder.page.getByLabel("Executive advisor")).toContainText("from $750");
  await expect(founder.page.getByLabel("Executive advisor")).toContainText("monthly call with an executive-level advisor");
  await founder.page.getByRole("link", { name: "Book your monthly call →" }).click();
  await expect(founder.page).toHaveURL(/\/advisory\?use_case=growth_leak&kind=monthly/);
  await expect(founder.page.getByRole("heading", { name: "Monthly executive advisor call" })).toBeVisible();
  // The textarea is controlled: re-fill until hydration has kept the value.
  const topic = founder.page.getByLabel(/What would you like to work through/);
  await expect(async () => {
    await topic.fill("Which fix to start with.");
    await expect(topic).toHaveValue("Which fix to start with.", { timeout: 1_000 });
  }).toPass();
  await founder.page.getByRole("button", { name: "Request a session" }).click();
  await expect(founder.page.getByText(/We'll email you/)).toBeVisible();
  await founder.page.goto("/baseline");
  await expect(founder.page.getByRole("region", { name: "The answer" })).toBeVisible();

  // --- Assessment history ---
  await founder.page.goto("/assessments");
  const history = founder.page.getByRole("table");
  await expect(history.getByRole("row", { name: /fix churn.*Purchased.*Complete/ })).toBeVisible();
  await expect(history.getByRole("row", { name: /repeatable sales motion.*Granted by your advisor.*Collecting data/ })).toBeVisible();

  // --- Advisor sees the advisory request on the company ---
  await admin.page.goto("/advisor/portfolio");
  await admin.page.getByRole("link", { name: /E2E Analytics/ }).first().click();
  await expect(admin.page.getByText("Which fix to start with.")).toBeVisible();

  // --- Analytics picks up the events ---
  await admin.page.goto("/advisor/analytics");
  await expect(admin.page.locator("div", { hasText: /^deliverable_published2$/ }).first()).toBeVisible();
  await expect(admin.page.getByText("Sign-up to first Benchmark")).toBeVisible();
  // The sign-up page is prerendered, so its view is counted from the browser.
  {
    const visitor = await browser.newContext();
    const page = await visitor.newPage();
    await page.goto("/sign-up");
    await expect(page.getByRole("button", { name: "Get my free Growth Snapshot" })).toBeVisible();
    await expect
      .poll(async () => {
        const db = new Client({ connectionString: E2E_DATABASE_URL });
        await db.connect();
        const { rows } = await db.query("select count(*)::int as n from events where name = 'signup_viewed'");
        await db.end();
        return rows[0].n;
      }, { timeout: 30_000 })
      .toBeGreaterThan(0);
    await visitor.close();
  }
  await admin.page.reload();
  await expect(admin.page.getByLabel("Sign-up and activation funnel")).toContainText("Viewed the sign-up page");

  await founder.ctx.close();
  await admin.ctx.close();
});
