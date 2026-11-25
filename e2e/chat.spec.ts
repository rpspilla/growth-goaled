import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The main entry: a founder picks a conversation starter, answers a question, gets a decision card,
 * rates it, and corrects a remembered fact. Another founder can't open the conversation.
 */
test("Rally: a founder starts from a suggestion, gets a short CRO answer with the full reasoning behind it, and rates it", async ({ browser }) => {
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
  // Rally is home: who you're talking to, four suggestions for the stage, and your own question.
  await page.goto("/start");
  await expect(page).toHaveURL(/\/whats-next$/);
  await expect(page.getByRole("heading", { name: "What's the growth decision in front of you, Chris?", level: 1 })).toBeVisible({ timeout: 60_000 });
  // Who to ask: the Rally Collective (chosen) or a CRO, as cards; suggestions sit under the question box.
  await expect(page.getByRole("radiogroup", { name: "Who to ask" }).getByRole("radio", { name: /Rally Collective/ })).toHaveAttribute("aria-checked", "true");
  const box = await page.getByLabel(/^Ask /).boundingBox();
  const firstSuggestion = await page.getByRole("group", { name: "Suggested questions" }).boundingBox();
  expect(firstSuggestion!.y).toBeGreaterThan(box!.y);
  await expect(page.getByRole("group", { name: "Suggested questions" }).getByRole("button")).toHaveText(["Where is our biggest growth constraint?", "Are we ready to hire our first salesperson?", "Why isn't our pipeline converting?", "How do we build a repeatable revenue engine?"]);
  // The old Strategic Growth Questions address lands on Rally too.
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/whats-next$/);
  await expect(page.getByRole("heading", { name: "Your conversations" })).toBeVisible();
  // The menu: the conversation first; the company pages under "Your company".
  const menu = page.getByRole("navigation", { name: "Menu" });
  await expect(menu.getByRole("link", { name: "New conversation" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Team" })).toBeHidden();
  await menu.getByRole("button", { name: "Your company" }).click();
  await expect(menu.getByRole("link", { name: "Team" })).toBeVisible();
  // No prices anywhere during the Beta.
  await expect(page.getByText(/\$\d/)).toHaveCount(0);

  // A suggestion opens the conversation in its own words, already answered.
  await page.getByRole("button", { name: "Are we ready to hire our first salesperson?" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Are we ready to hire our first salesperson?" })).toBeVisible();
  await expect(page.getByText(/Test mode: let's work through/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Talking with the Rally Collective" })).toBeVisible();
  await expect(page.getByText(/AI built on the documented expertise of the Rally Collective's CROs/)).toBeVisible();
  await expect(page.getByTestId("human-presence")).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Recommendation" })).toHaveCount(0);
  const url = page.url();
  await expect(menu.getByRole("list", { name: "Rally conversations" })).toContainText("Are we ready to hire our first salesperson?");

  // The next answer reads like a CRO talking: the position in bold, numbered steps, one question;
  // the full decision card is one click away. No plan offers during the Beta.
  await page.getByLabel("Your reply").fill("We have 3 reps and close about $20k deals.");
  await page.getByRole("button", { name: "Send" }).click();
  const conversationList = page.getByRole("list", { name: "Conversation", exact: true });
  await expect(conversationList.locator("strong", { hasText: "Fix conversion before adding volume." })).toBeVisible();
  await expect(conversationList.locator("ol li")).toHaveText(["Compare conversion by lead source.", "Review the last 10 lost deals."]);
  const card = page.getByRole("article", { name: "Recommendation" });
  await expect(card).toBeHidden();
  await page.getByText("See the full reasoning").last().click();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Test mode takeaway for Who should my first GTM hire be?");
  await expect(card).toContainText("Low confidence");
  await card.getByText("Show the full recommendation").click();
  await expect(card.getByText("Days 1–30")).toBeVisible();
  await expect(card).toContainText("Assumption");
  await expect(page.getByRole("region", { name: "Build my action plan" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save recommendation" })).toBeVisible();

  // Files can be dragged anywhere onto the page and dropped into the conversation.
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["a,b\n1,2"], "pipeline.csv", { type: "text/csv" }));
    window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
    (window as unknown as { __dt: DataTransfer }).__dt = dt;
  });
  await expect(page.getByText("Drop to share in this conversation")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new DragEvent("drop", { dataTransfer: (window as unknown as { __dt: DataTransfer }).__dt, bubbles: true })));
  await expect(page.getByText("Drop to share in this conversation")).toHaveCount(0);
  // The drop starts the same upload as the paperclip (test mode has no file storage, so it stops there).
  await expect(page.getByText(/Sharing pipeline\.csv|Upload failed/).first()).toBeVisible();
  await page.reload();

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
  expect(await y(reply)).toBeLessThan(await y(page.getByText("See the full reasoning").last()));
  // When reading finishes the page updates by itself.
  await fdb.query("update documents set status = 'done' where id = $1", [doc.rows[0].id]);
  await fdb.end();
  await expect(page.getByText("✓ forecast.xlsx read")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("progressbar", { name: "Reading forecast.xlsx" })).toHaveCount(0);

  // Helpful / Not helpful on the answer (a reason on Not helpful), kept after a reload.
  const rating = page.getByRole("group", { name: "Was this helpful?" }).last();
  await rating.getByRole("button", { name: "Not helpful" }).click();
  await rating.getByLabel("What was missing or wrong?").fill("Didn't use our deal size");
  await rating.getByRole("button", { name: "Send" }).click();
  await expect(rating.getByRole("status")).toContainText("That helps us improve Rally");
  await page.reload();
  await expect(page.getByRole("group", { name: "Was this helpful?" }).last().getByRole("button", { name: "Not helpful" })).toHaveAttribute("aria-pressed", "true");

  // Feedback is kept against the recommendation too (in the full card).
  await page.getByText("See the full reasoning").last().click();
  const more = card.getByText("Show the full recommendation");
  if (await more.isVisible()) await more.click();
  await card.getByRole("button", { name: "Helpful" }).click();
  await expect(card.getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByText("See the full reasoning").last().click();
  await page.getByRole("article", { name: "Recommendation" }).getByText("Show the full recommendation").click();
  await expect(page.getByRole("article", { name: "Recommendation" }).getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "true");

  // What they said is remembered and can be corrected.
  await page.getByRole("link", { name: "see or correct" }).click();
  const facts = page.locator("#facts");
  await facts.getByText(/What Rally remembers/).click();
  await expect(facts).toContainText("Sales team size");
  await expect(facts).toContainText("You said");
  await facts.getByRole("button", { name: "Correct Sales team size" }).click();
  await facts.getByLabel("Sales team size").fill("4");
  await facts.getByRole("button", { name: "Save" }).click();
  await expect(facts).toContainText("Confirmed");
  await expect(facts).toContainText("4");
  await expect(page.getByRole("list", { name: "Questions asked" }).getByRole("link", { name: "Are we ready to hire our first salesperson?" })).toBeVisible();

  // The founder's own words open a conversation too.
  await page.goto("/chat");
  await page.getByRole("textbox", { name: "Ask Rally" }).fill("Should we raise prices before hiring?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Should we raise prices before hiring?" })).toBeVisible();
  await expect(page.getByText(/Recent strategic growth questions/)).toHaveCount(0);
  // The chat keeps going; during the Beta it never points at paid help, even after six exchanges.
  const conversation = page.getByRole("list", { name: "Conversation", exact: true });
  for (let i = 2; i <= 6; i++) {
    await page.getByLabel("Your reply").fill(`Exchange ${i}`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(conversation.getByText(`Exchange ${i}`, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("complementary", { name: "Talk to Growth Goaled" })).toHaveCount(0);
  await expect(conversation).not.toContainText("talk this through with someone at Growth Goaled");
  await page.goto("/chat");
  await expect(page.getByRole("list", { name: "Questions asked" })).toContainText("Should we raise prices before hiring?");
  await ctx.close();

  // Another founder can't open it.
  const nosy = await browser.newContext();
  await nosy.addCookies([{ name: "gg_e2e_user", value: "nosy@e2e.test", domain: "localhost", path: "/" }]);
  const p2 = await nosy.newPage();
  const res = await p2.goto(url);
  expect(res?.status()).toBe(404);
  await nosy.close();
});
