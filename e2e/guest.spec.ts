import { expect, test } from "@playwright/test";

/**
 * The way in for a new founder: a conversation on the sign-in page. The email is only asked for once
 * there's a recommendation, which stays blurred until it's given; signing in turns it all into an
 * account, a company and a saved conversation.
 */
test("a visitor talks it through, unlocks the recommendation with an email, and keeps it after signing in", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "How can we help you grow?" })).toBeVisible();
  await expect(page.getByLabel("Work email")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  const answer = async (text: string) => {
    await page.getByLabel("Your answer").fill(text);
    await page.getByRole("button", { name: "Send" }).click();
  };
  await answer("Our pipeline isn't converting and I don't know whether to hire.");
  await expect(page.getByText("What's your name?")).toBeVisible();
  await answer("Robin Guest");
  await expect(page.getByText("Thanks, Robin. What's your company called?")).toBeVisible();
  await answer("Guestly");
  await page.getByRole("button", { name: "$1M–$3M" }).click();
  await page.getByLabel("Your answer").selectOption("2022");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Seed", exact: true }).click();
  await page.getByRole("button", { name: "Fintech" }).click();
  await answer("2");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("Last one: how many in customer success?")).toBeVisible();
  await answer("1");

  // The AI asks before it recommends; still no email asked for.
  await expect(page.getByText(/Test mode: let's work through/)).toBeVisible();
  await expect(page.getByLabel("Work email")).toHaveCount(0);
  await page.getByLabel("Your answer").fill("We close about $20k deals.");
  await page.getByRole("button", { name: "Send" }).click();

  // The recommendation is blurred until they give an email.
  const gate = page.getByRole("form", { name: "See your recommendation" });
  await expect(gate).toBeVisible();
  await expect(page.getByRole("article", { name: "Recommendation" })).toHaveCount(0);
  await gate.getByLabel("Work email").fill("robin@guestly.test");
  await gate.getByRole("button", { name: "See my recommendation" }).click();
  const card = page.getByRole("article", { name: "Recommendation" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Test mode takeaway");

  // Signing in (the link's landing, /claim) saves it as their account, company and conversation.
  await ctx.addCookies([{ name: "gg_e2e_user", value: "robin@guestly.test", domain: "localhost", path: "/" }]);
  await page.goto("/claim");
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Our pipeline isn't converting and I don't know whether to hire." })).toBeVisible();
  await expect(page.getByRole("article", { name: "Recommendation" })).toContainText("Test mode takeaway");
  await expect(page.getByRole("region", { name: "Build my action plan" })).toContainText("$499");
  await expect(page.getByRole("banner").getByText("Guestly", { exact: true })).toBeVisible();
  await ctx.close();
});
