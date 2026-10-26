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

test("founder: free snapshot, $149 assessment, results, optional advisory", async ({ browser }) => {
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
  await founder.page.goto("/overview");
  await expect(founder.page).toHaveURL(/\/welcome/);
  await founder.page.locator("#name").fill("Maya Founder");
  await founder.page.locator("#title").fill("CEO");
  await founder.page.locator("#companyName").fill("E2E Analytics");
  await founder.page.locator("#website").fill("e2e-analytics.test");
  await founder.page.locator("#revenueBand").selectOption("3m_10m");
  await founder.page.getByRole("button", { name: "Start Your Growth Profile" }).click();
  await expect(founder.page).toHaveURL(/\/overview/);

  // --- Founder: Overview → Library → questionnaire → free Snapshot → $149 purchase → Data ---
  const steps = founder.page.getByRole("navigation", { name: "Steps" });
  await expect(steps.getByText("Unlocks when you buy an assessment").first()).toBeVisible();
  await expect(steps.getByRole("link", { name: /Data/ })).toHaveCount(0);
  await founder.page.getByRole("link", { name: "Pick a question to answer →" }).click();
  await expect(founder.page).toHaveURL(/\/library$/);
  const leakCard = founder.page.locator("article", { has: founder.page.getByRole("heading", { name: "Where is our growth leaking?" }) });
  await expect(leakCard).toContainText("Recommended");
  await expect(leakCard).toContainText("Free Snapshot · Assessment $149");
  await expect(founder.page.locator("article", { hasText: "Are we ready to raise a Series A?" })).toContainText("Free Snapshot · Assessment $149");
  await leakCard.getByRole("link", { name: /Explore assessment/ }).click();
  await expect(founder.page).toHaveURL(/\/library\/growth_leak$/);
  await expect(founder.page.getByLabel("Pricing")).toContainText("$149");
  await expect(founder.page.getByRole("button", { name: /payment|\$149/ })).toHaveCount(0); // selecting is free
  const snapshotButton = founder.page.getByRole("button", { name: "See my free Snapshot" });
  await expect(snapshotButton).toBeDisabled();
  await founder.page.getByLabel(/What's the challenge you're trying to solve\?/).fill("Find out why growth slowed after Q2.");
  await founder.page.getByLabel(/^Stage/).selectOption("Series A");
  await founder.page.getByLabel(/^Sales model/).selectOption("Founder-led");
  await founder.page.getByLabel(/^NRR/).fill("94");
  await founder.page.getByLabel(/Which metric would tell you/).selectOption("arr");
  await founder.page.getByLabel(/Your target value/).fill("6,000,000");
  await founder.page.getByLabel("By when?").fill("2027-06-30");
  await founder.page.getByLabel("Where do you think the leak is?").fill("Deals stall after the demo.");
  await founder.page.getByLabel("Where do you think the leak is?").blur();
  await expect(founder.page.getByText("Your answers are saved.")).toBeVisible();
  // Answers survive a reload (autosave); profile answers now show as known instead of being asked again.
  await founder.page.reload();
  await expect(founder.page.getByLabel(/Your target value/)).toHaveValue("6000000");
  await expect(founder.page.getByText("your target", { exact: true })).toBeVisible();
  await expect(founder.page.getByText(/From your company profile: .*Stage Series A/)).toBeVisible();
  await expect(founder.page.getByLabel(/^Stage/)).toHaveCount(0);
  await snapshotButton.click();
  await expect(founder.page).toHaveURL(/\/library\/growth_leak\/snapshot$/);
  await expect(founder.page.getByText("Hypotheses", { exact: true })).toBeVisible();
  await expect(founder.page.getByText("Your existing customers shrink on net")).toBeVisible();
  await expect(founder.page.getByText("Based on: Your answer: NRR 94%")).toBeVisible();
  // How we work with companies like this one, and what we'd do after the assessment.
  await expect(founder.page.getByRole("heading", { name: "How we work with companies like yours" })).toBeVisible();
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
  await expect(founder.page.getByRole("heading", { name: "Data for Growth Leak" })).toBeVisible();
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
  await expect(founder.page.getByText("Purchased · sharing data")).toBeVisible();
  await expect(founder.page.getByText("Your target: ARR $6M by 2027-06-30")).toBeVisible();

  for (const section of ["company", "customers", "gtm", "icp", "hiring"]) {
    await founder.page.goto(`/profile/${section}`);
    await fillSection(founder.page);
  }
  await expect(founder.page.getByRole("link", { name: "Go to Data →" })).toBeVisible();

  // --- Founder: Data shows only Growth Leak's items, in priority order ---
  await founder.page.goto("/data");
  await expect(founder.page.getByRole("heading", { name: "Data for Growth Leak" })).toBeVisible();
  await expect(founder.page.getByText(/benchmark/i)).toHaveCount(0);
  await expect(founder.page.getByRole("heading", { name: "Needed for the assessment (3)" })).toBeVisible();
  await expect(founder.page.getByText("Why it matters:").first()).toBeVisible();
  await expect(founder.page.getByText("0 of 3 required items in")).toBeVisible();
  // Analysis is never blocked: with data missing it runs on what's shared and lists the gaps.
  await expect(founder.page.getByRole("button", { name: "Analyze what I've shared" })).toBeEnabled();
  const build = founder.page.getByRole("button", { name: "Analyze my data" });
  const groups = founder.page.getByRole("group", { name: /^Status of / });
  await expect(groups).toHaveCount(9); // 3 required + 5 helpful + 1 optional
  for (let i = 0; i < 3; i++) {
    const button = groups.nth(i).getByRole("button", { name: "Available", exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await expect(founder.page.getByText("Ready: everything the assessment needs is in.")).toBeVisible();
  await build.click();
  await expect(founder.page).toHaveURL(/\/baseline/);

  // --- Founder: self-service results, built from their answers and data ---
  await expect(founder.page.getByRole("heading", { name: /1 · Executive decision/ })).toBeVisible({ timeout: 90_000 });
  await expect(founder.page.getByRole("heading", { name: "Where is our growth leaking?" })).toBeVisible();
  // The Decision Brief: the same nine sections for every use case.
  for (const [n, section] of ["Executive decision", "Where you are now", "Diagnosis", "Evidence, assumptions and confidence", "Options", "Recommendation", "30–90 day plan", "What would change this recommendation", "Follow-up"].entries()) {
    await expect(founder.page.getByRole("heading", { name: `${n + 1} · ${section}`, exact: true })).toBeVisible();
  }
  await expect(founder.page.getByText(/every statement was checked against your inputs/)).toBeVisible();
  await expect(founder.page.getByText("Test mode brief: Where is our growth leaking?")).toBeVisible();
  await expect(founder.page.getByText(/^Peer reference: E2E Series A founder-led.*Approved, cited reference data only\./)).toBeVisible();
  await expect(founder.page.getByText(/Should we hire more salespeople/)).toBeVisible();
  await founder.page.getByRole("button", { name: "Evidence →" }).first().click();
  await expect(founder.page.getByRole("dialog", { name: "Sources" })).toContainText("Checked in code against your inputs.");
  await founder.page.getByRole("button", { name: "Close" }).click();

  // --- Founder: commits to the plan and tracks it on Progress ---
  await founder.page.getByRole("button", { name: "Commit to this plan" }).click();
  await expect(founder.page.getByText(/You committed to this plan on/)).toBeVisible();
  await founder.page.getByRole("link", { name: "Track progress →" }).click();
  await expect(founder.page.getByRole("heading", { name: "Progress & Tracking" })).toBeVisible();
  await expect(founder.page.getByRole("heading", { name: /Plan · 0 of 2 done/ })).toBeVisible();
  await founder.page.getByLabel("Status").first().selectOption("done");
  await expect(founder.page.getByRole("heading", { name: /Plan · 1 of 2 done/ })).toBeVisible();
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
  await founder.page.getByRole("button", { name: "Re-run with my latest data" }).click();
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
  for (const label of ["Overview", "Use Case Library", "Data", "Results", "Progress & Tracking"]) await expect(mirrored.getByRole("link", { name: label })).toBeVisible();
  await expect(admin.page.getByText(/Purchased .* · paid/)).toBeVisible();
  // The advisor can see the same results with the QA checks, and mark them reviewed.
  await mirrored.getByRole("link", { name: "Results" }).click();
  await expect(admin.page.getByText("Visible to the founder")).toBeVisible();
  await expect(admin.page.getByText(/✓ Data consistency/)).toBeVisible();
  await admin.page.getByLabel("Note for the founder").fill("Checked against your profile.");
  await admin.page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(admin.page.getByText("Reviewed", { exact: true })).toBeVisible();
  await mirrored.getByRole("link", { name: "Use Case Library" }).click();
  await expect(admin.page.getByText("Find out why growth slowed after Q2.")).toBeVisible();
  await expect(admin.page.getByText("Deals stall after the demo.")).toBeVisible();
  // Pilot: grant an assessment without payment, recorded with a note.
  await admin.page.locator("section", { hasText: "Winning ICP" }).getByPlaceholder("Why (e.g. pilot customer)").fill("E2E pilot");
  await admin.page.locator("section", { hasText: "Winning ICP" }).getByRole("button", { name: "Grant without payment" }).click();
  await expect(admin.page.getByText(/Granted without payment by E2E Admin .* · E2E pilot/)).toBeVisible();

  // --- Founder: the switcher follows the granted assessment; results now show as reviewed ---
  await founder.page.goto("/data");
  const switcher = founder.page.getByRole("combobox", { name: "Active use case" });
  await switcher.selectOption("winning_icp");
  await expect(founder.page.getByRole("heading", { name: "Data for Winning ICP" })).toBeVisible();
  await switcher.selectOption("growth_leak");
  await expect(founder.page.getByRole("heading", { name: "Data for Growth Leak" })).toBeVisible();
  await expect(founder.page.getByRole("link", { name: "View your results →" })).toBeVisible();
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
  await founder.page.getByLabel(/What would you like to work through/).fill("Which fix to start with.");
  await founder.page.getByRole("button", { name: "Request a session" }).click();
  await expect(founder.page.getByText(/We'll email you/)).toBeVisible();
  await founder.page.goto("/baseline");
  await expect(founder.page.getByRole("heading", { name: /Executive decision/ })).toBeVisible();

  // --- Assessment history ---
  await founder.page.goto("/assessments");
  const history = founder.page.getByRole("table");
  await expect(history.getByRole("row", { name: /growth leaking.*Purchased.*Complete/ })).toBeVisible();
  await expect(history.getByRole("row", { name: /winning with.*Granted by your advisor.*Collecting data/ })).toBeVisible();

  // --- Advisor sees the advisory request on the company ---
  await admin.page.goto("/advisor/portfolio");
  await admin.page.getByRole("link", { name: /E2E Analytics/ }).first().click();
  await expect(admin.page.getByText("Which fix to start with.")).toBeVisible();

  // --- Analytics picks up the events ---
  await admin.page.goto("/advisor/analytics");
  await expect(admin.page.locator("div", { hasText: /^deliverable_published2$/ }).first()).toBeVisible();
  await expect(admin.page.getByText("Sign-up to first Benchmark")).toBeVisible();

  await founder.ctx.close();
  await admin.ctx.close();
});
