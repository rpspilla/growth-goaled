import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * Rally Beta (Nov 24, 2026): after two helpful answers a founder is invited (once) to say what would
 * make Rally indispensable; feedback from the menu; the team reads it all on the Rally Beta page.
 */
test("Rally Beta: rate answers, share feedback, and read the Beta metrics", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query("delete from users where email in ('rally-founder@e2e.test', 'rally-admin@e2e.test')");
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('rally-founder@e2e.test','e2e:rally-founder@e2e.test','founder','Sam Rally', now()) returning id");
  const c = await db.query("insert into companies (name, revenue_band, stage) values ('Rallyco', '1m_3m', 'Series A') returning id");
  await db.query("insert into company_members (company_id, user_id, member_role) values ($1, $2, 'owner')", [c.rows[0].id, u.rows[0].id]);
  await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('rally-admin@e2e.test','e2e:rally-admin@e2e.test','admin','Ada Admin', now())");
  await db.end();

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "gg_e2e_user", value: "rally-founder@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  // Speech recognition stand-in: "hears" a question in two parts (interim, then final) and ends on stop.
  await page.addInitScript(() => {
    type Handler = ((e: unknown) => void) | null;
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: Handler = null;
      onerror: Handler = null;
      onend: (() => void) | null = null;
      start() {
        const result = (text: string, isFinal: boolean) => Object.assign([{ transcript: text }], { isFinal });
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [result("Where should we", false)] }), 50);
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [result("Where should we focus next quarter?", true)] }), 150);
      }
      stop() {
        setTimeout(() => this.onend?.(), 10);
      }
      abort() {}
    }
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) Object.defineProperty(window, name, { value: FakeRecognition, configurable: true, writable: true });
  });
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "What's the growth decision in front of you, Sam?" })).toBeVisible({ timeout: 120_000 });
  // Series A suggestions
  await expect(page.getByRole("group", { name: "Suggested questions" })).toContainText("Should we hire more salespeople?");
  // Speak instead of typing: the words land in the box, editable, then send as usual.
  await page.getByRole("button", { name: "Speak your question" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Listening…" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask Rally" })).toHaveValue("Where should we focus next quarter?");
  await page.getByRole("button", { name: "Stop speaking" }).click();
  await expect(page.getByRole("button", { name: "Speak your question" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask Rally" })).toHaveValue("Where should we focus next quarter?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  // The reply box has the microphone too.
  await expect(page.getByRole("button", { name: "Speak your question" })).toBeVisible();
  await page.getByLabel("Your reply").fill("We have 3 reps.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("See the full reasoning").last()).toBeVisible();
  const ratings = page.getByRole("group", { name: "Was this helpful?" });
  await ratings.nth(0).getByRole("button", { name: "Helpful", exact: true }).click();
  await expect(ratings.nth(0).getByRole("status")).toHaveText("Thanks. Glad it helped.");
  await ratings.nth(1).getByRole("button", { name: "Helpful", exact: true }).click();
  await page.getByRole("link", { name: "Tell us in a minute" }).click();
  await expect(page.getByRole("heading", { name: "Help shape Rally" })).toBeVisible();
  const form = page.getByRole("form", { name: "Rally feedback" });
  await form.getByLabel("What would make Rally indispensable to your business?").fill("A weekly pipeline review with me.");
  await form.getByLabel("Yes").check();
  await form.getByRole("button", { name: "Send feedback" }).click();
  await expect(form.getByText("Saved", { exact: true })).toBeVisible();
  // Share feedback is always in the menu.
  await expect(page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Share feedback" })).toHaveAttribute("href", "/feedback");
  await ctx.close();

  const staff = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await staff.addCookies([{ name: "gg_e2e_user", value: "rally-admin@e2e.test", domain: "localhost", path: "/" }]);
  const admin = await staff.newPage();
  await admin.goto("/advisor/portfolio");
  await admin.getByRole("link", { name: "Rally Beta" }).click();
  await expect(admin.getByRole("heading", { name: "Rally Beta", level: 1 })).toBeVisible({ timeout: 60_000 });
  await expect(admin.getByRole("region", { name: "Activation" })).toContainText("Activated founders");
  await expect(admin.getByRole("region", { name: "Helpfulness" })).toContainText("Answers rated helpful");
  await expect(admin.getByRole("region", { name: "Founder feedback" })).toContainText("A weekly pipeline review with me.");
  await expect(admin.getByRole("region", { name: "Founder feedback" })).toContainText("after a helpful answer");
  await expect(admin.getByRole("region", { name: "Most common questions" })).toContainText("Where should we focus next quarter?");
  await staff.close();
});
