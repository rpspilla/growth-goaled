import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * Rally in a CRO's own voice (Nov 24, 2026): the CRO adds a recording on their profile (with consent)
 * and a founder hears that CRO's AI answers in it, labelled as an AI voice. Test mode stands a silent
 * clip in for ElevenLabs.
 */
test("a CRO creates their voice; a founder listens to an answer in it", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query("delete from cro_profiles where slug = 'vera-voice'");
  await db.query("delete from users where email in ('vera@e2e.test', 'voice-founder@e2e.test')");
  const vera = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('vera@e2e.test','e2e:vera@e2e.test','advisor','Vera Voice', now()) returning id");
  const cro = await db.query("insert into cro_profiles (name, slug, bio, status, user_id, in_collective) values ('Vera Voice', 'vera-voice', 'CRO.', 'published', $1, true) returning id", [vera.rows[0].id]);
  const f = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('voice-founder@e2e.test','e2e:voice-founder@e2e.test','founder','Fay', now()) returning id");
  const c = await db.query("insert into companies (name, revenue_band, stage) values ('Voiceco', '1m_3m', 'Seed') returning id");
  await db.query("insert into company_members (company_id, user_id, member_role) values ($1, $2, 'owner')", [c.rows[0].id, f.rows[0].id]);
  const conv = await db.query("insert into conversations (company_id, user_id, topic, title, cro_id) values ($1, $2, 'other', 'Should we add a second AE?', $3) returning id", [c.rows[0].id, f.rows[0].id, cro.rows[0].id]);
  await db.query("insert into conversation_messages (conversation_id, role, content) values ($1, 'user', 'Should we add a second AE?')", [conv.rows[0].id]);
  await db.query("insert into conversation_messages (conversation_id, role, content, cro_id) values ($1, 'assistant', '**Not yet.** Prove the first AE can close without you.', $2)", [conv.rows[0].id, cro.rows[0].id]);
  await db.end();

  // --- Vera sets up her voice on her profile ---
  const cctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await cctx.addCookies([{ name: "gg_e2e_user", value: "vera@e2e.test", domain: "localhost", path: "/" }]);
  const cp = await cctx.newPage();
  await cp.goto(`/advisor/cros/${cro.rows[0].id}`);
  const voice = cp.getByRole("region", { name: "Your voice" });
  await expect(voice).toBeVisible({ timeout: 120_000 });
  await voice.getByLabel("Voice recordings").setInputFiles({ name: "vera.mp3", mimeType: "audio/mpeg", buffer: Buffer.alloc(2000, 1) });
  await expect(voice.getByRole("list", { name: "Recordings" })).toContainText("vera.mp3");
  const create = voice.getByRole("button", { name: "Create my voice" });
  await expect(create).toBeDisabled();
  await voice.getByRole("checkbox").check();
  await create.click();
  await expect(voice.getByRole("status")).toContainText("Your voice is ready");
  await expect(voice).toContainText("✓ Voice ready");
  await cctx.close();

  // --- The founder hears Vera's AI answer in her voice, labelled as an AI voice ---
  const fctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await fctx.addCookies([{ name: "gg_e2e_user", value: "voice-founder@e2e.test", domain: "localhost", path: "/" }]);
  const fp = await fctx.newPage();
  const requests: string[] = [];
  fp.on("request", (r) => r.url().includes("/api/speak/") && requests.push(r.url()));
  await fp.goto(`/chat/${conv.rows[0].id}`);
  await fp.getByRole("button", { name: "Listen" }).click();
  await expect(fp.getByRole("status").filter({ hasText: "Playing Vera Voice's AI voice" })).toBeVisible();
  await expect(fp.getByRole("button", { name: "Listen" })).toBeVisible({ timeout: 15_000 });
  expect(requests.length).toBeGreaterThan(0);
  // Someone else's company: no audio.
  const other = await fctx.request.get(`/api/speak/00000000-0000-0000-0000-000000000000`);
  expect(other.status()).toBe(404);
  await fctx.close();
});

/** The speech recognition stand-in: each listen "hears" the next phrase, then ends on silence. */
const fakeSpeech = (phrases: string[]) => {
  type Handler = ((e: unknown) => void) | null;
  if (!sessionStorage.getItem("fake-phrases")) sessionStorage.setItem("fake-phrases", JSON.stringify(phrases));
  class FakeRecognition {
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: Handler = null;
    onerror: Handler = null;
    onend: (() => void) | null = null;
    ended = false;
    start() {
      const queue = () => JSON.parse(sessionStorage.getItem("fake-phrases") ?? "[]") as string[];
      const phrase = queue()[0];
      const result = (text: string, isFinal: boolean) => Object.assign([{ transcript: text }], { isFinal });
      if (!phrase) return void setTimeout(() => this.end(), 400);
      setTimeout(() => {
        if (this.ended) return;
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
};

test("a visitor talks to Rally from the landing page, hands-free; founders have the microphone on the Overview", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.addInitScript(fakeSpeech, ["Our pipeline isn't converting.", "Robin Guest"]);
  await page.goto("/sign-in");
  await page.getByText("Or ask Rally a question first").click();
  // First tap: Rally says hello, then listens; a pause sends; Rally answers aloud and listens again.
  await page.getByRole("button", { name: "Talk to Rally" }).click();
  const chat = page.getByRole("list", { name: "Conversation", exact: true });
  await expect(chat).toContainText("Our pipeline isn't converting.", { timeout: 60_000 });
  await expect(chat).toContainText("What's your name?");
  await expect(chat).toContainText("Robin Guest", { timeout: 60_000 });
  await expect(page.getByText("Thanks, Robin. What's your company called?")).toBeVisible({ timeout: 30_000 });
  // Nothing more said: the microphone goes off, and the box is empty.
  await expect(page.getByRole("button", { name: "Talk to Rally" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Your answer")).toHaveValue("");
  await expect(chat.getByRole("button", { name: "Listen" }).first()).toBeVisible();
  // Website chat speech only for the visitor's own chat (no voice set up here: nothing to stream).
  expect((await page.request.get("/api/speak/guest/2")).status()).toBe(404);
  // Transcription is for visitors with a chat under way, or people signed in.
  const t = await page.request.post("/api/transcribe", { multipart: { audio: { name: "s.webm", mimeType: "audio/webm", buffer: Buffer.alloc(500, 1) } } });
  expect(await t.json()).toMatchObject({ ok: true, text: expect.stringContaining("what should we focus on") });
  const anon = await browser.newContext();
  const noChat = await anon.request.post("http://localhost:3210/api/transcribe", { multipart: { audio: { name: "s.webm", mimeType: "audio/webm", buffer: Buffer.alloc(500, 1) } } });
  expect(noChat.status()).toBe(401);
  await anon.close();
  await ctx.close();

  // The founder's Overview has the microphone too.
  const f = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await f.addCookies([{ name: "gg_e2e_user", value: "voice-founder@e2e.test", domain: "localhost", path: "/" }]);
  const fp = await f.newPage();
  await fp.goto("/overview");
  await expect(fp.getByRole("heading", { name: "What are you working through?" })).toBeVisible({ timeout: 60_000 });
  await expect(fp.getByRole("button", { name: "Talk to Rally" })).toBeVisible();
  await f.close();
});
