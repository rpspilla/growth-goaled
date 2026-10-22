import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

type NeonAuth = ReturnType<typeof createNeonAuth>;

let instance: NeonAuth | undefined;

/**
 * Neon Auth (Managed Better Auth) server instance. Created lazily so that
 * `next build` does not need auth secrets to collect page data.
 */
export function getAuth(): NeonAuth {
  if (!instance) {
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    const secret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!baseUrl || !secret) {
      throw new Error("NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET must be set");
    }
    instance = createNeonAuth({ baseUrl, cookies: { secret } });
  }
  return instance;
}
