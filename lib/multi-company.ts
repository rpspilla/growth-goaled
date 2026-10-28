/**
 * Founders who may run more than one company profile (e.g. an operator or a fractional CRO
 * working across companies). Set by email in MULTI_COMPANY_FOUNDERS (comma-separated); everyone
 * else keeps exactly one company, created at onboarding.
 */
export const COMPANY_COOKIE = "gg_company";

export function canAddCompanies(email: string | null | undefined, env: string | undefined = process.env.MULTI_COMPANY_FOUNDERS): boolean {
  if (!email || !env) return false;
  const allowed = env.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
