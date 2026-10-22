export const STAGING_HOST = "dev.growthgoaled.com";

/** True when this deployment is the staging app (APP_URL points at the dev domain). */
export function isStaging(appUrl = process.env.APP_URL): boolean {
  if (!appUrl) return false;
  try {
    return new URL(appUrl).hostname === STAGING_HOST;
  } catch {
    return false;
  }
}
