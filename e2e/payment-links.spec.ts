import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/** Custom projects: an advisor makes a payment link; the client pays it without an account; the advisor sees it paid. */
test("an advisor sends a custom-project payment link and the client pays it", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('links@e2e.test','e2e:links@e2e.test','advisor','Lena Links', now()) on conflict (auth_user_id) do update set role = 'advisor'");
  await db.end();

  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "gg_e2e_user", value: "links@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto("/advisor/plans");
  await page.getByRole("link", { name: "Payment links" }).click();
  await expect(page).toHaveURL(/\/advisor\/payment-links$/);

  const form = page.getByRole("form", { name: "New payment link" });
  await form.getByLabel("Project title").fill("Pipeline and forecasting overhaul");
  await form.getByLabel("What it covers (shown to the client)").fill("Six weeks: pipeline stages, forecast model and weekly cadence.");
  await form.getByLabel("Amount (USD)").fill("7500");
  await form.getByLabel("Client name (optional)").fill("Jordan");
  await form.getByLabel("Client email (optional)").fill("jordan@client.test");
  await form.getByRole("button", { name: "Create payment link" }).click();
  const url = await form.getByLabel("Payment link").inputValue();
  expect(url).toMatch(/\/pay\/[A-Za-z0-9_-]{24}$/);
  const list = page.getByRole("region", { name: "Your payment links" });
  await expect(list).toContainText("Pipeline and forecasting overhaul");
  await expect(list).toContainText("$7,500");
  await expect(list).toContainText("Waiting for payment");

  // The client: no account, just the link.
  const client = await browser.newContext();
  const pay = await client.newPage();
  await pay.goto(new URL(url).pathname);
  const payment = pay.getByRole("region", { name: "Payment" });
  await expect(payment).toContainText("For Jordan");
  await expect(payment).toContainText("Six weeks: pipeline stages");
  await payment.getByRole("button", { name: "Pay $7,500" }).click();
  await expect(pay.getByRole("status")).toContainText("Paid. Thank you.");
  await client.close();

  await page.reload();
  await expect(page.getByRole("region", { name: "Your payment links" })).toContainText("Paid");
  await expect(page.getByRole("region", { name: "Your payment links" })).not.toContainText("Waiting for payment");

  // A link that doesn't exist is a 404.
  const res = await page.goto("/pay/this-token-does-not-exist-anywhere");
  expect(res?.status()).toBe(404);
  await ctx.close();
});
