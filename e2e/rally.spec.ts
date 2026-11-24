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
  // Speech recognition stand-in: each listen "hears" the next phrase (interim, then final, then
  // silence); with nothing left to say it ends on its own, like the browser after a long silence.
  await page.addInitScript(() => {
    type Handler = ((e: unknown) => void) | null;
    const w = window as unknown as { __phrases?: string[]; __listens?: number };
    if (!sessionStorage.getItem("fake-phrases")) sessionStorage.setItem("fake-phrases", JSON.stringify(["Where should we focus next quarter?", "We have 3 reps."]));
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: Handler = null;
      onerror: Handler = null;
      onend: (() => void) | null = null;
      ended = false;
      start() {
        w.__listens = (w.__listens ?? 0) + 1;
        const queue = () => JSON.parse(sessionStorage.getItem("fake-phrases") ?? "[]") as string[];
        const phrase = queue()[0];
        const result = (text: string, isFinal: boolean) => Object.assign([{ transcript: text }], { isFinal });
        if (!phrase) {
          setTimeout(() => this.end(), 400);
          return;
        }
        setTimeout(() => !this.ended && this.onresult?.({ resultIndex: 0, results: [result(phrase.split(" ").slice(0, 2).join(" "), false)] }), 50);
        setTimeout(() => {
          if (this.ended) return;
          // Heard: used up.
          sessionStorage.setItem("fake-phrases", JSON.stringify(queue().slice(1)));
          this.onresult?.({ resultIndex: 0, results: [result(phrase, true)] });
        }, 150);
      }
      end() {
        if (this.ended) return;
        this.ended = true;
        this.onend?.();
      }
      stop() {
        setTimeout(() => this.end(), 10);
      }
      abort() {
        setTimeout(() => this.end(), 10);
      }
    }
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) Object.defineProperty(window, name, { value: FakeRecognition, configurable: true, writable: true });
  });
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "What's the growth decision in front of you, Sam?" })).toBeVisible({ timeout: 120_000 });
  // Series A suggestions
  await expect(page.getByRole("group", { name: "Suggested questions" })).toContainText("Should we hire more salespeople?");
  // Talk to Rally: the words appear as they're said, and a pause sends the question.
  await page.getByRole("button", { name: "Talk to Rally" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Listening…" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask Rally" })).toHaveValue("Where should we focus next quarter?");
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Where should we focus next quarter?" })).toBeVisible();
  // Rally answered, so it listens for the reply; that sends on the pause too, and the box is left empty.
  const thread = page.getByRole("list", { name: "Conversation", exact: true });
  await expect(thread.getByText("We have 3 reps.", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("See the full reasoning").last()).toBeVisible();
  await expect(page.getByLabel("Your reply")).toHaveValue("");
  // Rally listens again; saying nothing switches the microphone off, and the box stays empty.
  await expect(page.getByRole("button", { name: "Talk to Rally" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "Listening…" })).toHaveCount(0);
  await expect(page.getByLabel("Your reply")).toHaveValue("");
  // Reloading doesn't switch it back on (voice mode ended).
  await page.reload();
  await expect(page.getByRole("button", { name: "Talk to Rally" })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("status").filter({ hasText: "Listening…" })).toHaveCount(0);
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
