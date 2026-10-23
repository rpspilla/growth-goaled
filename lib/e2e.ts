/**
 * End-to-end test mode. Lets Playwright sign in without email and stubs the
 * model calls. It can only switch on under `next dev` outside Vercel, with
 * E2E_AUTH=1 set explicitly, so it can never be active on a deployment.
 */
export const E2E_COOKIE = "gg_e2e_user";

export function e2eEnabled(): boolean {
  return process.env.E2E_AUTH === "1" && process.env.NODE_ENV === "development" && !process.env.VERCEL && !process.env.VERCEL_ENV;
}
