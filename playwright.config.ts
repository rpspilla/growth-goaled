import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
export const E2E_DATABASE_URL = "postgres://postgres@127.0.0.1:54329/gg_e2e";

/**
 * End-to-end run against a throwaway local Postgres and `next dev` in test
 * mode (E2E_AUTH=1: cookie sign-in and stubbed model calls; see lib/e2e.ts).
 * Run with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: `bash e2e/db.sh start && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      E2E_AUTH: "1",
      DATABASE_URL: E2E_DATABASE_URL,
      NEON_AUTH_BASE_URL: "https://e2e.invalid/auth",
      NEON_AUTH_COOKIE_SECRET: "e2e-cookie-secret-not-used-xxxxxxxxxxxxxxxxxxxxxxxx",
      APP_URL: `http://localhost:${PORT}`,
      MULTI_COMPANY_FOUNDERS: "multi@e2e.test",
    },
  },
});
