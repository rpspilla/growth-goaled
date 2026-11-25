import { expect, test, type Browser } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The Release 1 journey from the Nov 25, 2026 product audit (Ben Carcio's walkthrough), end to end, on
 * a desktop and a phone: visit Rally, understand it, get access, create an account with the basics,
 * land home, pick a CRO, get their answer, save it, ask the Collective, find past conversations, and
 * go home and switch between experts.
 */
async function journey(browser: Browser, viewport: { width: number; height: number }, email: string) {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query(
    "insert into cro_profiles (slug, name, title, headline, status, in_collective, expertise) values ('jo-journey', 'Jo Journey', 'Former CRO, Journeyco', 'Took two startups from $1M to $10M ARR.', 'published', true, '{sales hiring,founder-led sales}') on conflict (slug) do update set status = 'published'",
  );
  await db.end();

  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  // 1–2. A new visitor sees what Rally is, with how it works one click away.
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Meet your CRO collective." })).toBeVisible();
  await expect(page.getByText("Experienced operators. Different perspectives. Better growth decisions.")).toBeVisible();
  await page.getByText("How Rally works").click();
  await expect(page.getByText("Ask the Collective or one CRO")).toBeVisible();
  // 3. One way in.
  await expect(page.getByRole("button", { name: "Get Access to Rally" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Beta Access/ })).toHaveCount(0);

  // 4–5. The link signs them in (simulated); the company step asks only the basics.
  await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
  await page.goto("/claim");
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByLabel("Annual revenue (ARR)")).toBeHidden();
  await page.getByLabel("Your name").fill("Jess Journey");
  await page.getByLabel("Your role").fill("CEO & co-founder");
  await page.getByLabel("Company name").fill("Journeyco");
  await page.getByLabel("Vertical").selectOption("Fintech");
  await page.getByLabel(/main growth challenge/).fill("Should I hire my first VP of Sales?");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // 6. Home: the challenge waits in the box; the Collective and each CRO to choose from.
  await expect(page).toHaveURL(/\/whats-next\?ask=/);
  await expect(page.getByRole("heading", { name: "What's the growth decision in front of you, Jess?" })).toBeVisible();
  await expect(page.getByLabel(/^Ask /)).toHaveValue("Should I hire my first VP of Sales?");
  const who = page.getByRole("radiogroup", { name: "Who to ask" });
  await expect(who.getByRole("radio", { name: /Rally Collective/ })).toHaveAttribute("aria-checked", "true");

  // 7–9. Pick one CRO and ask: their AI answers, clearly an AI built on their expertise.
  await who.getByRole("radio", { name: /Jo Journey/ }).click();
  await expect(page.getByText("An AI built on Jo's documented expertise and judgment, not Jo in person.")).toBeVisible();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("group", { name: "Talking with Jo Journey's CRO-Brain" })).toBeVisible();
  await expect(page.getByText(/Test mode \(Jo Journey's AI\)/).first()).toBeVisible();
  await page.getByLabel("Your reply").fill("Two of us sell today; $20k deals.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("See the full reasoning").last()).toBeVisible();

  // 10. Save the recommendation (separate from committing); it's under Decisions.
  await page.getByRole("button", { name: "Save recommendation" }).click();
  await expect(page.getByRole("button", { name: "Saved to Decisions" })).toBeVisible();
  await page.goto("/decisions");
  const saved = page.getByRole("list", { name: "Decisions" }).getByRole("listitem").first();
  await expect(saved).toContainText("Saved");
  await expect(saved).toContainText("Jo Journey");

  // 11. Home via the Rally logo, then ask the Collective.
  await page.locator('a[aria-label="Rally home"]:visible').first().click();
  await expect(page).toHaveURL(/\/whats-next$/);
  await page.getByRole("radiogroup", { name: "Who to ask" }).getByRole("radio", { name: /Rally Collective/ }).click();
  await page.getByLabel(/^Ask /).fill("How should we structure AE commission?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("group", { name: "Talking with the Rally Collective Brain" })).toBeVisible();

  // 12. Previous conversations, all or by who answered.
  await page.locator('a[aria-label="Rally home"]:visible').first().click();
  const list = page.getByRole("list", { name: "Questions asked" });
  await expect(list).toContainText("Should I hire my first VP of Sales?");
  await expect(list).toContainText("How should we structure AE commission?");
  await page.getByRole("navigation", { name: "Show conversations with" }).getByRole("link", { name: "Jo Journey" }).click();
  await expect(list).toContainText("Should I hire my first VP of Sales?");
  await expect(list).not.toContainText("How should we structure AE commission?");

  // 13. Back into the Collective's conversation and switch to Jo without losing it.
  await page.getByRole("navigation", { name: "Show conversations with" }).getByRole("link", { name: "Rally Collective Brain" }).click();
  await list.getByRole("link", { name: /How should we structure AE commission\?/ }).click();
  await page.getByLabel("Continue with").selectOption({ label: "Jo Journey's CRO-Brain" });
  await expect(page.getByRole("group", { name: "Talking with Jo Journey's CRO-Brain" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How should we structure AE commission?" })).toBeVisible();
  // The page fits the screen: nothing scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await ctx.close();
}

test("the Rally journey on a desktop", async ({ browser }) => {
  test.setTimeout(240_000);
  await journey(browser, { width: 1440, height: 900 }, "journey-desk@e2e.test");
});

test("the Rally journey on a phone", async ({ browser }) => {
  test.setTimeout(240_000);
  await journey(browser, { width: 390, height: 844 }, "journey-phone@e2e.test");
});
