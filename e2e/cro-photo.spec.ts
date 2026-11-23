import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";

/** A CRO's profile photo (Nov 24, 2026): dropped onto the profile or chosen from a file, shown on the public page. */
const RED_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4o6GBFTEMLQkAe3tLAfuiUfAAAAAASUVORK5CYII=", "base64");

test("drop or choose a CRO photo; it shows on their public page", async ({ browser }) => {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  await db.query("insert into users (email, auth_user_id, role, name, onboarded_at) values ('photo-admin@e2e.test','e2e:photo-admin@e2e.test','admin','Pat Admin', now()) on conflict (auth_user_id) do update set role = 'admin'");
  await db.query("delete from cro_profiles where slug = 'pia-photo'");
  const cro = await db.query("insert into cro_profiles (name, slug, bio, status) values ('Pia Photo', 'pia-photo', 'CRO.', 'published') returning id");
  await db.end();
  const id = cro.rows[0].id as string;

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addCookies([{ name: "gg_e2e_user", value: "photo-admin@e2e.test", domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`/advisor/cros/${id}`);
  const photo = page.getByRole("group", { name: "Profile photo" });
  await expect(photo.getByRole("button", { name: "Upload a photo" })).toBeVisible({ timeout: 120_000 });

  // Drag and drop onto the circle
  const transfer = await page.evaluateHandle((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "me.png", { type: "image/png" }));
    return dt;
  }, RED_PNG.toString("base64"));
  await photo.getByRole("button", { name: "Upload a photo" }).dispatchEvent("drop", { dataTransfer: transfer });
  await expect(photo.getByRole("status")).toHaveText("Photo saved.");
  await expect(photo.getByRole("img", { name: "Pia Photo's photo" })).toBeVisible();

  // Saving the rest of the profile keeps it
  await page.getByRole("form", { name: "CRO profile" }).getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("form", { name: "CRO profile" }).getByRole("status").last()).toBeVisible();

  // Choosing a file replaces it; a non-image is refused
  await photo.getByLabel("Photo file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(photo.getByRole("status")).toHaveText("Use a JPG, PNG or WebP image.");
  await photo.getByLabel("Photo file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: RED_PNG });
  await expect(photo.getByRole("status")).toHaveText("Photo saved.");

  // On the public page, signed out
  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.goto("/network/pia-photo");
  const img = pub.locator("img").first();
  await expect(img).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await anon.close();

  await page.reload();
  await photo.getByRole("button", { name: "Remove photo" }).click();
  await expect(photo.getByRole("status")).toHaveText("Photo removed.");
  await ctx.close();
});
