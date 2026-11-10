import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/** Several people on one company: a founder invites a teammate, who joins the same company; the owner removes them. */
test("a founder invites a teammate who joins the same company, then removes them", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('lead@teamco.test','e2e:lead@teamco.test','founder','Lee Lead', now()) returning id");
  const c = await db.query("insert into companies (name, revenue_band, stage) values ('Team Co', '1m_3m', 'Seed') returning id");
  await db.query("insert into company_members (company_id, user_id, member_role) values ($1, $2, 'owner')", [c.rows[0].id, u.rows[0].id]);
  await db.end();

  const owner = await browser.newContext();
  await owner.addCookies([{ name: "gg_e2e_user", value: "lead@teamco.test", domain: "localhost", path: "/" }]);
  const page = await owner.newPage();
  await page.goto("/overview");
  await page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Team" }).click();
  await expect(page).toHaveURL(/\/team$/);
  const form = page.getByRole("form", { name: "Invite a teammate" });
  await form.getByLabel("Teammate's email").fill("pat@teamco.test");
  await form.getByRole("button", { name: "Send invite" }).click();
  const link = await page.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("region", { name: "Pending invites" })).toContainText("pat@teamco.test");

  // The teammate opens the link, signs in, and joins as a member.
  const mate = await browser.newContext();
  await mate.addCookies([{ name: "gg_e2e_user", value: "pat@teamco.test", domain: "localhost", path: "/" }]);
  const matePage = await mate.newPage();
  await matePage.goto(new URL(link).pathname);
  await expect(matePage.getByText(/Lee Lead invited you to join Team Co/)).toBeVisible();
  await matePage.getByRole("button", { name: "Join Team Co" }).click();
  // A new teammate confirms their name on the welcome step, then lands in the shared company.
  await expect(matePage).toHaveURL(/\/welcome/);
  await matePage.getByLabel("Your name").fill("Pat Mate");
  await matePage.locator("form").getByRole("button").click();
  await expect(matePage).not.toHaveURL(/\/welcome/);
  await matePage.goto("/team");
  const people = matePage.getByRole("region", { name: "People with access" });
  await expect(people).toContainText("Lee Lead");
  await expect(people).toContainText("Member");
  // Members can't remove anyone.
  await expect(people.getByRole("button", { name: /Remove/ })).toHaveCount(0);

  // The owner sees them and removes them.
  await page.reload();
  const list = page.getByRole("region", { name: "People with access" });
  await expect(list).toContainText("pat@teamco.test");
  page.once("dialog", (d) => d.accept());
  await list.getByRole("button", { name: "Remove pat@teamco.test" }).click();
  await expect(list).not.toContainText("pat@teamco.test");
  await mate.close();
  await owner.close();
});
