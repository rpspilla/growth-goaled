import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The main entry: a founder picks a conversation starter, answers a question, gets a decision card,
 * rates it, and corrects a remembered fact. Another founder can't open the conversation.
 */
test("a founder talks a decision through and gets a recommendation card", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  for (const [email, company] of [["chat@e2e.test", "Chatty Co"], ["nosy@e2e.test", "Nosy Co"]]) {
    const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ($1, $2, 'founder', 'Chris', now()) on conflict (auth_user_id) do update set name = 'Chris' returning id", [email, `e2e:${email}`]);
    const c = await db.query("insert into companies (name, revenue_band, stage) values ($1, '1m_3m', 'Seed') returning id", [company]);
    await db.query("insert into company_members (company_id, user_id) values ($1, $2)", [c.rows[0].id, u.rows[0].id]);
  }
  await db.end();

  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: "chat@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto("/overview");

  // All twelve starters, in the owner's words, lead the Overview.
  await expect(page.getByRole("heading", { name: "What are you trying to figure out?" })).toBeVisible();
  for (const s of ["How do I build a repeatable revenue engine?", "Who should my first GTM hire be?", "How much equity should I give my first sales hire?", "Are we ready to raise our next round?", "How can we improve retention and revenue efficiency?", "Something else."]) {
    await expect(page.getByRole("button", { name: s })).toBeVisible();
  }

  // A starter opens the conversation, already answered with at most two questions.
  await page.getByRole("button", { name: "Should we hire more salespeople?" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Should we hire more salespeople?" })).toBeVisible();
  await expect(page.getByText(/Test mode: let's work through/)).toBeVisible();
  // A person is behind the conversation.
  await expect(page.getByTestId("human-presence")).toContainText("A real CRO reviews every action plan");
  await expect(page.getByTestId("human-presence")).not.toContainText("Ryan Spillane");
  await expect(page.getByRole("article", { name: "Recommendation" })).toHaveCount(0);
  const url = page.url();

  // Answering gives the decision card, with the action plan offered alongside.
  await page.getByLabel("Your reply").fill("We have 3 reps and close about $20k deals.");
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByRole("article", { name: "Recommendation" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Test mode takeaway for Should we hire more salespeople?");
  await expect(card).toContainText("Low confidence");
  // Short by default: the headline and how sure we are; the rest is one click away.
  await expect(card.getByText("Days 1–30")).toBeHidden();
  await card.getByText("Show the full recommendation").click();
  await expect(card.getByText("Days 1–30")).toBeVisible();
  await expect(card).toContainText("Assumption");
  // Right under it: the packaging, each paid offer with "buy" and "talk to an advisor first".
  const offer = page.getByRole("region", { name: "Build my action plan" });
  await expect(offer.getByRole("group", { name: "Explore" })).toContainText("Free");
  await expect(offer.getByRole("group", { name: "Diagnose" })).toContainText("$499");
  await expect(offer.getByRole("group", { name: "Execute & Monitor" })).toContainText("$899");
  await expect(offer.getByRole("group", { name: "Execute & Monitor" })).toContainText("Two hours of live CRO support each month");
  await expect(offer.getByRole("group", { name: "Custom Projects" })).toContainText("Starting at $5,000");
  await expect(offer.getByRole("group", { name: "Custom Projects" }).getByRole("link", { name: "Discuss a Project" })).toHaveAttribute("href", "https://calendly.com/spillane-ryan/new-meeting");
  for (const name of ["Diagnose", "Execute & Monitor"]) {
    await expect(offer.getByRole("group", { name }).getByRole("link", { name: "Talk to an advisor first" })).toHaveAttribute("href", /\/advisory\/book\?kind=review&offer=/);
  }
  await expect(page.getByRole("complementary", { name: "How to read your recommendation" })).toHaveCount(0);

  // A shared file being read: it shows in the conversation with live progress, and the reply box stays
  // under the conversation and above the latest recommendation.
  const conversationId = url.split("/").at(-1)!;
  const fdb = new Client({ connectionString: E2E_DATABASE_URL });
  await fdb.connect();
  const co = await fdb.query("select company_id from conversations where id = $1", [conversationId]);
  const doc = await fdb.query("insert into documents (company_id, doc_type, blob_url, filename, mime, size, status, inbox) values ($1, 'other', 'e2e://forecast.xlsx', 'forecast.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 100, 'analyzing', true) returning id", [co.rows[0].company_id]);
  await fdb.query("insert into conversation_messages (conversation_id, role, content, document_ids) values ($1, 'user', 'Shared a file: forecast.xlsx', $2::jsonb)", [conversationId, JSON.stringify([doc.rows[0].id])]);
  await page.reload();
  const shared = page.getByText("Shared a file: forecast.xlsx");
  await expect(shared).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Reading forecast.xlsx" })).toBeVisible();
  const y = async (l: import("@playwright/test").Locator) => (await l.boundingBox())!.y;
  const reply = page.getByLabel("Your reply");
  expect(await y(shared)).toBeLessThan(await y(reply));
  expect(await y(reply)).toBeLessThan(await y(page.getByRole("article", { name: "Recommendation" })));
  // When reading finishes the page updates by itself.
  await fdb.query("update documents set status = 'done' where id = $1", [doc.rows[0].id]);
  await fdb.end();
  await expect(page.getByText("✓ forecast.xlsx read")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("progressbar", { name: "Reading forecast.xlsx" })).toHaveCount(0);

  // Feedback is kept against the recommendation (in the full card).
  const more = card.getByText("Show the full recommendation");
  if (await more.isVisible()) await more.click();
  await card.getByRole("button", { name: "Helpful" }).click();
  await expect(card.getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("article", { name: "Recommendation" }).getByText("Show the full recommendation").click();
  await expect(page.getByRole("article", { name: "Recommendation" }).getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "true");

  // What they said is remembered and can be corrected.
  await page.getByRole("link", { name: "See or correct them" }).click();
  const facts = page.locator("#facts");
  await expect(facts).toContainText("Sales team size");
  await expect(facts).toContainText("You said");
  await facts.getByRole("button", { name: "Correct Sales team size" }).click();
  await facts.getByLabel("Sales team size").fill("4");
  await facts.getByRole("button", { name: "Save" }).click();
  await expect(facts).toContainText("Confirmed");
  await expect(facts).toContainText("4");
  await expect(page.getByRole("link", { name: "Should we hire more salespeople?" })).toBeVisible();

  // "Something else" uses the founder's own words.
  await page.goto("/overview");
  await page.getByRole("button", { name: "Something else." }).click();
  await page.getByLabel("What's on your mind?").fill("Should we raise prices before hiring?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByRole("heading", { name: "Should we raise prices before hiring?" })).toBeVisible();
  await expect(page.getByText(/Pick up where you left off/)).toHaveCount(0);
  // The chat keeps going; from the sixth exchange it gently points at talking to Growth Goaled.
  const conversation = page.getByRole("list", { name: "Conversation" });
  for (let i = 2; i <= 6; i++) {
    await expect(page.getByRole("complementary", { name: "Talk to Growth Goaled" })).toHaveCount(0);
    await page.getByLabel("Your reply").fill(`Exchange ${i}`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(conversation.getByText(`Exchange ${i}`, { exact: true })).toBeVisible();
  }
  const nudge = page.getByRole("complementary", { name: "Talk to Growth Goaled" });
  await expect(nudge.getByRole("link", { name: "Book a free call" })).toHaveAttribute("href", "/advisory/book?kind=review&offer=nudge");
  await expect(conversation).toContainText("talk this through with someone at Growth Goaled");
  await page.goto("/overview");
  await expect(page.getByText(/Pick up where you left off/)).toBeVisible();
  await ctx.close();

  // Another founder can't open it.
  const nosy = await browser.newContext();
  await nosy.addCookies([{ name: "gg_e2e_user", value: "nosy@e2e.test", domain: "localhost", path: "/" }]);
  const p2 = await nosy.newPage();
  const res = await p2.goto(url);
  expect(res?.status()).toBe(404);
  await nosy.close();
});
