/**
 * Founders who may run more than one company profile (e.g. an operator or a fractional CRO
 * working across companies). Set by email in MULTI_COMPANY_FOUNDERS (comma-separated); everyone
 * else keeps exactly one company, created at onboarding.
 */
export const COMPANY_COOKIE = "gg_company";

function listed(email: string | null | undefined, env: string | undefined): boolean {
  if (!email || !env) return false;
  const allowed = env.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export function canAddCompanies(email: string | null | undefined, env: string | undefined = process.env.MULTI_COMPANY_FOUNDERS): boolean {
  return listed(email, env);
}

/**
 * Founders who may switch themselves between the founder and advisor views (e.g. a fractional CRO
 * who runs their own company profiles and advises them). Set by email in SELF_ADVISOR_EMAILS
 * (comma-separated). Never applies to admins, whose role is left alone.
 */
export function canSwitchToAdvisor(email: string | null | undefined, env: string | undefined = process.env.SELF_ADVISOR_EMAILS): boolean {
  return listed(email, env);
}
