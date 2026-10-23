import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { e2eEnabled } from "@/lib/e2e";

/**
 * Static checks that every entry point checks who is calling. Role logic itself
 * is unit-tested in access.test.ts; these make sure nothing skips it.
 */

const root = path.resolve(import.meta.dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const appFiles = walk(path.join(root, "app"));
const read = (p: string) => readFileSync(p, "utf8");
const rel = (p: string) => path.relative(root, p);

const GUARDS = /requireRole\(|requireUser\(|founderCompany\(\)|managed\(|managedItemCompany\(|staff\(\)/;

describe("server actions", () => {
  const files = appFiles.filter((f) => f.endsWith(".ts") && read(f).trimStart().startsWith('"use server"'));

  it("finds the action files", () => expect(files.length).toBeGreaterThan(10));

  for (const file of files) {
    const src = read(file);
    const bodies = src.split(/\nexport async function /).slice(1);
    for (const body of bodies) {
      const name = body.slice(0, body.indexOf("("));
      it(`${rel(file)} › ${name} checks the caller`, () => expect(body).toMatch(GUARDS));
    }
  }

  it("helper guards themselves call requireRole", () => {
    for (const file of files) {
      const src = read(file);
      for (const helper of ["founderCompany", "managed", "managedItemCompany", "staff"]) {
        const def = src.match(new RegExp(`(?:async function ${helper}\\(|const ${helper} = \\(\\) =>)[\\s\\S]{0,200}`));
        if (def) expect(def[0], `${rel(file)} ${helper}`).toMatch(/requireRole\(/);
      }
    }
  });
});

describe("pages", () => {
  it("every founder page requires the founder role", () => {
    const pages = appFiles.filter((f) => f.includes(`${path.sep}(founder)${path.sep}`) && f.endsWith("page.tsx"));
    expect(pages.length).toBeGreaterThan(10);
    for (const p of pages) {
      const src = read(p);
      // Readiness pages use loadReadiness(), which calls requireRole(["founder"]); /upload only redirects.
      expect(src, rel(p)).toMatch(/requireRole\(\["founder"\]\)|loadReadiness\(\)|^[\s\S]*redirect\("\/readiness"\)/);
    }
    expect(read(path.join(root, "app/(founder)/readiness/load.ts"))).toMatch(/requireRole\(\["founder"\]\)/);
    expect(read(path.join(root, "app/(founder)/layout.tsx"))).toMatch(/requireRole\(\["founder"\]\)|requireUser\(/);
  });

  it("the advisor area requires advisor or admin, and admin pages require admin", () => {
    expect(read(path.join(root, "app/advisor/layout.tsx"))).toMatch(/requireRole\(\["advisor", "admin"\]\)/);
    for (const p of ["app/advisor/users/page.tsx", "app/advisor/analytics/page.tsx"]) expect(read(path.join(root, p)), p).toMatch(/requireRole\(\["admin"\]\)/);
  });
});

describe("route handlers", () => {
  it("check the caller (except the auth API itself)", () => {
    const routes = appFiles.filter((f) => f.endsWith("route.ts") && !f.includes(`${path.sep}api${path.sep}auth${path.sep}`));
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) expect(read(r), rel(r)).toMatch(/requireRole\(|getCurrentUser\(/);
  });
});

describe("end-to-end test mode", () => {
  it("is off unless explicitly enabled under next dev outside Vercel", () => {
    const env = { ...process.env };
    try {
      process.env.E2E_AUTH = "1";
      Object.assign(process.env, { NODE_ENV: "production" });
      expect(e2eEnabled()).toBe(false);
      Object.assign(process.env, { NODE_ENV: "development" });
      process.env.VERCEL = "1";
      expect(e2eEnabled()).toBe(false);
      delete process.env.VERCEL;
      delete process.env.VERCEL_ENV;
      expect(e2eEnabled()).toBe(true);
      delete process.env.E2E_AUTH;
      expect(e2eEnabled()).toBe(false);
    } finally {
      process.env = env;
    }
  });
});
