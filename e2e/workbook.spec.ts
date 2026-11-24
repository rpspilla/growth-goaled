import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * Managing CRO knowledge (Nov 24, 2026): an admin imports a CRO Training Workbook (each CRO's answers
 * become their Scenario records), validates the import, reviews a flagged conflict between two CROs,
 * and an advisor corrects an AI answer, which becomes a Correction record for review.
 */
test("import a training workbook, review a conflict, correct an AI answer", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query("delete from cro_profiles where name in ('Wanda Workbook', 'Xavier Example')");
  const admin = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('wb-admin@e2e.test','e2e:wb-admin@e2e.test','admin','Wil Admin', now()) on conflict (auth_user_id) do update set role = 'admin' returning id");
  for (const [name, slug] of [["Wanda Workbook", "wanda-workbook"], ["Xavier Example", "xavier-example"]])
    await db.query("insert into cro_profiles (name, slug, bio, status) values ($1, $2, 'CRO.', 'published')", [name, slug]);
  await db.query("delete from companies where name = 'Correctco'");
  const c = await db.query("insert into companies (name, revenue_band, stage, advisor_id) values ('Correctco', '1m_3m', 'Seed', $1) returning id", [admin.rows[0].id]);
  const conv = await db.query("insert into conversations (company_id, topic, title) values ($1, 'first_gtm_hire', 'Who should we hire first?') returning id", [c.rows[0].id]);
  await db.query("insert into conversation_messages (conversation_id, role, content) values ($1, 'user', 'Who should we hire first?'), ($1, 'assistant', 'Hire a VP of Sales now.')", [conv.rows[0].id]);
  await db.end();

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addCookies([{ name: "gg_e2e_user", value: "wb-admin@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();

  // --- Import: Wanda answered in the "Your …" columns; Xavier in his named column ---
  const csv = [
    "Scenario ID,Category,Stage,Founder Situation,Founder Question,Your Initial Instinct / What Jumps Out,Your Recommendation / Position,Xavier Answer,Differences / Discussion,Status",
    'WB-001,Hiring & Organization,Seed,"Founder sells, two reps struggle.",Should we hire a VP Sales?,Too early.,Keep founder-led sales one more quarter.,Hire an experienced AE now.,Wanda waits; Xavier hires.,Draft',
    "WB-002,Pricing & Revenue,Seed,Prospects say too expensive.,Should we discount?,,,,,",
  ].join("\n");
  await page.goto("/advisor/intelligence");
  await expect(page.getByRole("heading", { name: "CRO intelligence library" })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("link", { name: "Import a training workbook" }).click();
  const form = page.getByRole("form", { name: "Import a workbook" });
  // Nothing chosen yet: the form says so. A file that isn't a workbook is refused before upload.
  await form.getByRole("button", { name: "Import" }).click();
  await expect(form.getByRole("alert")).toHaveText("Choose the workbook file.");
  const drop = form.getByLabel("Drop the workbook here");
  const dropFile = async (name: string, type: string, text: string) => {
    const dt = await page.evaluateHandle(({ n, t, body }) => {
      const d = new DataTransfer();
      d.items.add(new File([body], n, { type: t }));
      return d;
    }, { n: name, t: type, body: text });
    await drop.dispatchEvent("drop", { dataTransfer: dt });
  };
  await dropFile("notes.pdf", "application/pdf", "x");
  await expect(form.getByText(/Use the workbook as \.xlsx or \.csv/)).toBeVisible();
  // Dragged onto the box
  await dropFile("workbook.csv", "text/csv", csv);
  await expect(drop).toContainText("workbook.csv ready to import");
  await form.getByLabel("Respondent").selectOption({ label: "Wanda Workbook" });
  await form.getByRole("button", { name: "Import" }).click();
  const result = page.getByRole("status", { name: "Import result" });
  await expect(result).toContainText("2 scenarios read: 2 records added, 0 updated, 0 unchanged, 1 not answered yet.");
  await result.getByRole("button", { name: "Validate all 2 imported" }).click();
  await expect(result).toContainText("2 validated");

  // --- The flagged conflict between Wanda's and Xavier's answers ---
  await page.goto("/advisor/intelligence?cro=");
  const list = page.getByRole("list", { name: "Intelligence records" });
  const wanda = list.getByRole("listitem").filter({ hasText: "WB-001: Should we hire a VP Sales?" }).filter({ hasText: "Wanda Workbook" });
  await expect(async () => {
    await page.reload();
    await expect(wanda).toContainText("Possible conflict", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await wanda.getByRole("link").first().click();
  await expect(page.getByText("Where our CROs differ: Wanda waits; Xavier hires.")).toBeVisible();
  const conflicts = page.getByRole("region", { name: "Possible conflicts" });
  await expect(conflicts).toContainText("Xavier Example");
  await conflicts.getByRole("button", { name: "Confirm" }).click();
  await expect(conflicts).toContainText("Confirmed: CROs differ");

  // --- Correct an AI answer from the founder's conversation ---
  await page.goto(`/advisor/companies/${c.rows[0].id}/conversations/${conv.rows[0].id}`);
  await page.getByText("Correct this answer").click();
  const correction = page.getByRole("form", { name: "Correct this answer" });
  await correction.getByLabel("What was wrong").fill("Too early for a VP.");
  await correction.getByLabel("The right guidance").fill("Hire a senior AE first; the founder keeps selling until the motion repeats.");
  await correction.getByRole("button", { name: "Save correction" }).click();
  await expect(correction.getByRole("status")).toContainText("Saved");
  await page.goto("/advisor/intelligence?type=correction");
  await expect(page.getByRole("list", { name: "Intelligence records" })).toContainText("Correction: Who should we hire first?");
  await expect(page.getByRole("list", { name: "Intelligence records" })).toContainText("Network position");

  // --- Contributions in the quality report ---
  await page.goto("/advisor/quality");
  const contrib = page.getByRole("table", { name: "Contributions by CRO" });
  await expect(contrib.getByRole("row").filter({ hasText: "Wanda Workbook" })).toBeVisible();

  await ctx.close();
});
