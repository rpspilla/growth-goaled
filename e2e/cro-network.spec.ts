import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/**
 * The multi-CRO network (Nov 23, 2026): an admin adds and publishes CROs and links their logins; each
 * CRO writes their own intelligence, another validates it, and one disputes another's. A founder then
 * talks to one CRO's AI (only that CRO's intelligence, clearly an AI) and to the Collective (everyone's,
 * with the disagreement named), and every card says what it drew on.
 */
test("CROs contribute attributed intelligence; founders ask one CRO's AI or the Collective", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query("delete from cro_profiles where name in ('Nora Network', 'Omar Okafor')");
  await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('net-admin@e2e.test','e2e:net-admin@e2e.test','admin','Ned Admin', now()) on conflict (auth_user_id) do update set role = 'admin'");
  for (const [email, name] of [["net-nora@e2e.test", "Nora Login"], ["net-omar@e2e.test", "Omar Login"]] as const)
    await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ($1, $2, 'advisor', $3, now()) on conflict (auth_user_id) do update set role = 'advisor', name = $3", [email, `e2e:${email}`, name]);
  const u = await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('net-founder@e2e.test','e2e:net-founder@e2e.test','founder','Fay Founder', now()) on conflict (auth_user_id) do update set name = 'Fay Founder' returning id");
  await db.query("delete from companies where name = 'Netco'");
  const c = await db.query("insert into companies (name, revenue_band, stage, industry) values ('Netco', '1m_3m', 'Seed', 'SaaS') returning id");
  await db.query("delete from company_members where user_id = $1", [u.rows[0].id]);
  await db.query("insert into company_members (company_id, user_id, member_role) values ($1, $2, 'owner')", [c.rows[0].id, u.rows[0].id]);
  await db.end();

  const as = async (email: string) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await ctx.addCookies([{ name: "gg_e2e_user", value: email, domain: "localhost", path: "/" }]);
    return { ctx, page: await ctx.newPage() };
  };

  // --- Admin: add two CROs, fill in their profiles, link their logins, publish ---
  const admin = await as("net-admin@e2e.test");
  for (const [name, login, bio, expertise] of [
    ["Nora Network", "Nora Login", "Two-time Seed-stage CRO who rebuilt founder-led sales motions.", "sales hiring, founder-led sales"],
    ["Omar Okafor", "Omar Login", "Scaled SaaS sales teams from $1M to $20M ARR.", "sales hiring, organizational design"],
  ] as const) {
    await admin.page.goto("/advisor/cros");
    await expect(admin.page.getByRole("heading", { name: "CRO network" })).toBeVisible({ timeout: 120_000 });
    const add = admin.page.getByRole("form", { name: "Add a CRO" });
    await add.getByLabel("Name").fill(name);
    await add.getByRole("button", { name: "Add CRO" }).click();
    await expect(admin.page.getByRole("heading", { name, level: 1 })).toBeVisible();
    const profile = admin.page.getByRole("form", { name: "CRO profile" });
    await profile.getByLabel("Professional biography").fill(bio);
    await profile.getByLabel("Areas of expertise").fill(expertise);
    await profile.getByLabel("Views on hiring").fill(name === "Nora Network" ? "Founders sell first; hire when the motion repeats." : "Hire experienced AEs early when inbound is strong.");
    await profile.getByLabel("Level of directness").fill("Very direct");
    await profile.getByRole("button", { name: "Save profile" }).click();
    await expect(profile.getByRole("status")).toContainText("Saved");
    const pub = admin.page.getByRole("form", { name: "Publishing" });
    await pub.getByLabel("Status").selectOption("published");
    await pub.getByLabel("Login").selectOption({ label: login });
    await pub.getByRole("button", { name: "Save" }).click();
    await expect(pub.getByRole("status")).toContainText("Saved");
  }

  // --- Nora writes a principle attributed to herself and submits it ---
  const nora = await as("net-nora@e2e.test");
  await nora.page.goto("/advisor/intelligence");
  const create = nora.page.getByRole("form", { name: "New intelligence record" });
  await expect(create.getByLabel("Primary CRO")).toHaveValue("Nora Network");
  await create.getByLabel("Title").fill("Founders sell until the motion repeats");
  await create.getByLabel("Content", { exact: true }).fill("Don't hire a VP of Sales before the founder has closed 20 deals the same way.");
  await create.getByLabel("Expertise areas").fill("sales hiring, founder-led sales");
  await create.getByLabel("Tags").fill("vp of sales");
  await create.getByLabel("Evidence").selectOption("experience");
  await create.getByRole("button", { name: "Save draft" }).click();
  await expect(nora.page.getByRole("heading", { name: "Founders sell until the motion repeats" })).toBeVisible();
  const noraRecord = nora.page.url();
  await nora.page.getByRole("button", { name: "Submit for review" }).click();
  await expect(nora.page.getByText("Submitted for review")).toBeVisible();
  // She can't validate her own.
  await expect(nora.page.getByRole("button", { name: "Validate" })).toHaveCount(0);

  // --- Omar writes his own, validates Nora's, and disputes it with his reasoning ---
  const omar = await as("net-omar@e2e.test");
  await omar.page.goto("/advisor/intelligence");
  const mine = omar.page.getByRole("form", { name: "New intelligence record" });
  await mine.getByLabel("Title").fill("Hire an experienced AE early with strong inbound");
  await mine.getByLabel("Content", { exact: true }).fill("When inbound demand is strong, an experienced AE finds the repeatable motion faster than the founder.");
  await mine.getByLabel("Expertise areas").fill("sales hiring");
  await mine.getByLabel("Evidence").selectOption("data");
  await mine.getByRole("button", { name: "Save draft" }).click();
  await expect(omar.page.getByRole("heading", { name: "Hire an experienced AE early with strong inbound" })).toBeVisible();
  const omarRecord = omar.page.url();
  await omar.page.goto(noraRecord);
  await omar.page.getByRole("button", { name: "Validate" }).click();
  await expect(omar.page.getByText(/Validated by Omar Login/)).toBeVisible();
  const stance = omar.page.getByRole("form", { name: "My stance" });
  await stance.getByLabel("My stance").selectOption("disputes");
  await stance.getByLabel("Why").fill("Strong inbound changes the answer: hire the AE.");
  await stance.getByRole("button", { name: "Save my stance" }).click();
  await expect(omar.page.getByRole("region", { name: "Attribution" })).toContainText("Sees it differently");
  // Nora validates Omar's.
  await nora.page.goto(omarRecord);
  await nora.page.getByRole("button", { name: "Validate" }).click();
  await expect(nora.page.getByText(/Validated by Nora Login/)).toBeVisible();

  // --- The founder: the directory, then Nora's AI (hers only, clearly an AI) ---
  const f = await as("net-founder@e2e.test");
  await f.page.goto("/cros");
  await expect(f.page.getByRole("heading", { name: "Our CROs", level: 1 })).toBeVisible();
  await f.page.getByRole("link", { name: "Profile and ask Nora's AI →" }).click();
  await expect(f.page.getByText("Founders sell first; hire when the motion repeats.")).toBeVisible();
  await expect(f.page.getByText("not Nora in person")).toBeVisible();
  await f.page.getByRole("group", { name: "Common questions" }).getByRole("button", { name: "Who should my first GTM hire be?" }).click();
  await expect(f.page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(f.page.getByLabel("Who you're talking to")).toContainText("Nora Network's AI CRO");
  await expect(f.page.getByLabel("Who you're talking to")).toContainText("not Nora in person");
  await expect(f.page.getByText(/Test mode \(Nora Network's AI\)/).first()).toBeVisible();
  await f.page.getByLabel("Your reply").fill("Two of us sell; inbound is strong.");
  await f.page.getByRole("button", { name: "Send", exact: true }).click();
  const card = f.page.getByRole("article", { name: "Recommendation" });
  await card.getByText("Show the full recommendation").click();
  const informed = card.getByLabel("Informed by");
  await expect(informed).toContainText("Nora Network · Founders sell until the motion repeats");
  await expect(informed).not.toContainText("Omar");
  await expect(card.getByLabel("Where our CROs differ")).toHaveCount(0);

  // --- The Collective: both CROs, with the disagreement named ---
  await f.page.goto("/whats-next");
  await expect(f.page.getByLabel("Who to ask")).toHaveValue("");
  await f.page.getByRole("textbox", { name: "What are you working through?" }).fill("Should we hire a VP of Sales or keep founder-led sales?");
  await f.page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(f.page.getByLabel("Who you're talking to")).toContainText("Growth Goaled Collective");
  await f.page.getByLabel("Your reply").fill("We have strong inbound.");
  await f.page.getByRole("button", { name: "Send", exact: true }).click();
  const collective = f.page.getByRole("article", { name: "Recommendation" });
  await collective.getByText("Show the full recommendation").click();
  await expect(collective.getByLabel("Informed by")).toContainText("Nora Network");
  await expect(collective.getByLabel("Informed by")).toContainText("Omar Okafor");
  const differ = collective.getByLabel("Where our CROs differ");
  await expect(differ).toContainText("Nora Network:");
  await expect(differ).toContainText("Omar Okafor: Strong inbound changes the answer");
  await expect(differ).toContainText("the view that fits your company");

  // The quality report: conversations by CRO, and the records answers drew on.
  await admin.page.goto("/advisor/quality");
  await expect(admin.page.getByRole("table", { name: "By CRO" })).toContainText("Nora Network's AI");
  await expect(admin.page.getByRole("table", { name: "By CRO" })).toContainText("Growth Goaled Collective");
  await expect(admin.page.getByRole("table", { name: "Intelligence records in use" })).toContainText("Founders sell until the motion repeats");

  // A visitor on the website chat can pick a CRO's AI before the conversation starts.
  const visitor = await browser.newContext();
  const v = await visitor.newPage();
  await v.goto("/sign-in");
  const who = v.getByRole("group", { name: "Who to talk to" });
  await expect(who.getByRole("button", { name: "The Growth Goaled Collective" })).toHaveAttribute("aria-pressed", "true");
  await who.getByRole("button", { name: "Nora Network's AI CRO" }).click();
  await expect(who.getByRole("button", { name: "Nora Network's AI CRO" })).toHaveAttribute("aria-pressed", "true");
  await visitor.close();

  for (const x of [f, omar, nora, admin]) await x.ctx.close();
});
