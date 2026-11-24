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
