import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * Founder signs up → Overview → explores the library for free → answers the
 * questionnaire → free Growth Snapshot (no charge) → buys the $499 assessment
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

test("founder: free snapshot, $499 assessment, results, optional advisory", async ({ browser }) => {
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

  // --- Founder: Overview → Library → questionnaire → free Snapshot → $499 purchase → Data ---
  const steps = founder.page.getByRole("navigation", { name: "Steps" });
  await expect(steps.getByText("Unlocks when you buy an assessment").first()).toBeVisible();
  await expect(steps.getByRole("link", { name: /Data/ })).toHaveCount(0);
  await founder.page.getByRole("link", { name: "Pick a question to answer →" }).click();
  await expect(founder.page).toHaveURL(/\/library$/);
  const leakCard = founder.page.locator("article", { has: founder.page.getByRole("heading", { name: "Where is our growth leaking?" }) });
  await expect(leakCard).toContainText("Recommended");
  await expect(leakCard).toContainText("Free Snapshot · Assessment $499");
  await expect(founder.page.locator("article", { hasText: "Are we ready to raise a Series A?" })).toContainText("Assessment coming soon");
  await leakCard.getByRole("link", { name: /Explore assessment/ }).click();
  await expect(founder.page).toHaveURL(/\/library\/growth_leak$/);
  await expect(founder.page.getByLabel("Pricing")).toContainText("$499");
  await expect(founder.page.getByRole("button", { name: /payment|\$499/ })).toHaveCount(0); // selecting is free
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
  // Nothing has been charged or unlocked so far.
  {
    const db = new Client({ connectionString: E2E_DATABASE_URL });
    await db.connect();
    expect((await db.query("select count(*)::int as n from payments")).rows[0].n).toBe(0);
    await db.end();
  }
  await expect(steps.getByRole("link", { name: /Data/ })).toHaveCount(0);
  await founder.page.getByRole("button", { name: "Get the full assessment · $499" }).click();
  await expect(founder.page).toHaveURL(/\/data\?checkout=success/);
  await expect(founder.page.getByRole("heading", { name: "Data for Growth Leak" })).toBeVisible();
  await expect(steps.getByRole("link", { name: /Data/ })).toBeVisible();
  {
    const db = new Client({ connectionString: E2E_DATABASE_URL });
    await db.connect();
    const { rows } = await db.query("select amount_cents, status, use_case, purpose from payments");
    expect(rows).toEqual([{ amount_cents: 49900, status: "paid", use_case: "growth_leak", purpose: "assessment" }]);
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
  const build = founder.page.getByRole("button", { name: "Analyze my data" });
  await expect(build).toBeDisabled();
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

  // Nothing is visible to the founder before publishing.
  await founder.page.goto("/baseline");
  await expect(founder.page.getByText("An analyst is preparing your reviewed results.")).toBeVisible();

  // --- Advisor: claim; the company shows the founder's five steps ---
  await admin.page.goto("/advisor/unassigned");
  await admin.page.getByRole("button", { name: /Assign|Claim/ }).first().click();
  await admin.page.goto("/advisor/portfolio");
  await admin.page.getByRole("link", { name: /E2E Analytics/ }).first().click();
  const mirrored = admin.page.getByRole("navigation", { name: "Steps" });
  for (const label of ["Overview", "Use Case Library", "Data", "Results", "Progress & Tracking"]) await expect(mirrored.getByRole("link", { name: label })).toBeVisible();
  await expect(admin.page.getByText(/Purchased .* · paid/)).toBeVisible();
  await mirrored.getByRole("link", { name: "Use Case Library" }).click();
  await expect(admin.page.getByText("Find out why growth slowed after Q2.")).toBeVisible();
  await expect(admin.page.getByText("Deals stall after the demo.")).toBeVisible();
  // Pilot: grant an assessment without payment, recorded with a note.
  await admin.page.locator("section", { hasText: "Winning ICP" }).getByPlaceholder("Why (e.g. pilot customer)").fill("E2E pilot");
  await admin.page.locator("section", { hasText: "Winning ICP" }).getByRole("button", { name: "Grant without payment" }).click();
  await expect(admin.page.getByText(/Granted without payment by E2E Admin .* · E2E pilot/)).toBeVisible();

  // --- Advisor: review, approve, publish ---
  await admin.page.goto("/advisor/review");
  await admin.page.getByRole("link", { name: /E2E Analytics/ }).first().click();
  await expect(admin.page.getByText("Review now")).toBeVisible();
  await expect(admin.page.getByText("Data consistency")).toBeVisible();
  await admin.page.getByRole("button", { name: "Approve", exact: true }).click();
  await admin.page.getByPlaceholder(/Note for the founder/).fill("Checked against your profile.");
  await admin.page.getByRole("button", { name: "Confirm approval" }).click();
  await admin.page.getByRole("button", { name: "Publish to founder" }).click();
  await expect(admin.page.getByText("Published. The founder can see this version.")).toBeVisible();

  // --- Founder: sees the reviewed results ---
  // The use case switcher follows the advisor's pilot activation; steps 3–5 follow it.
  await founder.page.goto("/data");
  const switcher = founder.page.getByRole("combobox", { name: "Active use case" });
  await switcher.selectOption("winning_icp");
  await expect(founder.page.getByRole("heading", { name: "Data for Winning ICP" })).toBeVisible();
  await switcher.selectOption("growth_leak");
  await expect(founder.page.getByRole("heading", { name: "Data for Growth Leak" })).toBeVisible();
  await founder.page.goto("/baseline");
  await expect(founder.page.getByRole("heading", { name: "Where is our growth leaking?" })).toBeVisible();
  for (const section of ["Executive summary", "Main findings", "Evidence and supporting metrics", "Diagnosis and implications", "Recommended decision", "Prioritized actions", "Confidence, assumptions and data limitations", "Suggested next steps"]) {
    await expect(founder.page.getByRole("heading", { name: new RegExp(section) })).toBeVisible();
  }
  await expect(founder.page.getByText("is the main gap to the top quartile.").first()).toBeVisible();
  await expect(founder.page.getByText(/Checked against your profile\./)).toBeVisible();
  await expect(founder.page.getByText("ARR Growth").first()).toBeVisible();
  await expect(founder.page.getByText(/Should we hire more salespeople/)).toBeVisible();

  // --- Optional advisory: shown once, never gating the results ---
  await expect(founder.page.getByRole("link", { name: "Explore advisory support →" })).toHaveCount(1);
  await expect(founder.page.getByLabel("Optional advisory support")).toContainText("From $750");
  await founder.page.getByRole("link", { name: "Explore advisory support →" }).click();
  await expect(founder.page).toHaveURL(/\/advisory\?use_case=growth_leak/);
  await founder.page.getByLabel(/What would you like to work through/).fill("Which fix to start with.");
  await founder.page.getByRole("button", { name: "Request a session" }).click();
  await expect(founder.page.getByText(/We'll email you/)).toBeVisible();
  await founder.page.goto("/baseline");
  await expect(founder.page.getByRole("heading", { name: /Executive summary/ })).toBeVisible();

  // --- Assessment history ---
  await founder.page.goto("/assessments");
  const history = founder.page.getByRole("table");
  await expect(history.getByRole("row", { name: /growth leaking.*Purchased.*Complete/ })).toBeVisible();
  await expect(history.getByRole("row", { name: /winning with.*Granted by your advisor.*Collecting data/ })).toBeVisible();

  // --- Advisor sees the advisory request on the company ---
  await admin.page.goto("/advisor/portfolio");
  await admin.page.getByRole("link", { name: /E2E Analytics/ }).first().click();
  await expect(admin.page.getByText("Which fix to start with.")).toBeVisible();

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
