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
  await expect(page.getByTestId("human-presence")).toContainText("2,000+ startup investments");
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
  // Every answer is typed, like any chat: no buttons or dropdowns.
  await expect(page.getByRole("button", { name: "$1M–$3M" })).toHaveCount(0);
  await expect(page.locator("select")).toHaveCount(0);
  await answer("lots");
  await expect(page.getByText(/didn't catch a revenue figure/)).toBeVisible();
  await answer("about $2M");
  await expect(page.getByText("What year was it founded?")).toBeVisible();
  await answer("2022");
  await answer("we raised a seed round");
  await answer("fintech");
  await answer("2");
  await answer("skip");
  await expect(page.getByText("Last one: how many in customer success?")).toBeVisible();
  // The recommendation takes up to a minute in production: hold the answer back to check the wait
  // shows straight away (the message, a moving progress bar and steps) instead of a frozen page.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  let holding = true;
  await page.route("**/sign-in", async (route) => {
    if (holding && route.request().method() === "POST") {
      holding = false;
      await held;
    }
    await route.fallback();
  });
  await answer("1");
  await expect(page.getByText("1", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Super. Give me 60 Seconds while we spin-up an Industry Benchmarked Recommendation")).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole("progressbar", { name: "Building your recommendation" })).toBeVisible();
  await expect(page.getByText("Reading your answers")).toBeVisible();
  await expect(page.getByLabel("Your answer")).toHaveValue("");
  release();

  // The AI asks before it recommends; still no email asked for.
  await expect(page.getByText(/Test mode: let's work through/)).toBeVisible();
  await expect(page.getByLabel("Work email")).toHaveCount(0);
  await page.getByLabel("Your answer").fill("We close about $20k deals.");
  await page.getByRole("button", { name: "Send" }).click();

  // The headline and two insights show straight away; the rest is blurred until they give an email.
  const teaser = page.getByRole("region", { name: "Your recommendation" });
  await expect(teaser).toContainText("Test mode takeaway");
  await expect(teaser).toContainText("Test mode diagnosis.");
  await expect(teaser).toContainText("Stated by the founder in this conversation.");
  const gate = page.getByRole("form", { name: "See your recommendation" });
  await expect(gate).toBeVisible();
  await expect(page.getByRole("article", { name: "Recommendation" })).toHaveCount(0);
  // The chat stays open under the questions: answering refines the recommendation.
  await expect(page.getByLabel("Your answer")).toBeEnabled();
  // A conversion button under the recommendation and another at the end of the chat, by company name.
  const cta = (where: string) => page.getByTestId(`plan-cta-${where}`).getByRole("button", { name: "Get a CRO-Built GTM action plan for Guestly" });
  await expect(cta("card")).toBeVisible();
  await expect(cta("chat")).toBeVisible();
  // Before the email, it takes them to the email box.
  await cta("chat").click();
  await expect(gate.getByLabel("Work email")).toBeFocused();
  await gate.getByLabel("Work email").fill("robin@guestly.test");
  await gate.getByRole("button", { name: "See my recommendation" }).click();
  const card = page.getByRole("article", { name: "Recommendation" });
  await expect(card).toBeVisible();
  await expect(cta("card")).toBeVisible();
  await expect(cta("chat")).toBeVisible();
  await expect(card).toContainText("Test mode takeaway");

  // Signing in (the link's landing, /claim) saves it as their account, company and conversation.
  await ctx.addCookies([{ name: "gg_e2e_user", value: "robin@guestly.test", domain: "localhost", path: "/" }]);
  // The link from the action-plan button opens the saved conversation at the plan offer.
  await page.goto("/claim?plan=1");
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}#build-plan$/);
  await expect(page.getByRole("heading", { name: "Our pipeline isn't converting and I don't know whether to hire." })).toBeVisible();
  await expect(page.getByRole("article", { name: "Recommendation" })).toContainText("Test mode takeaway");
  await expect(page.getByRole("region", { name: "Build my action plan" })).toContainText("$499");
  await expect(page.getByRole("banner").getByText("Guestly", { exact: true })).toBeVisible();
  await ctx.close();
});
