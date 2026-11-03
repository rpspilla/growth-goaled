import { FOUNDING_YEARS, FUNDING_STAGES, VERTICALS } from "@/lib/intake";
import { understand } from "./understand";
import { companyBasicsSchema, REVENUE_BANDS, type CompanyBasics } from "@/lib/onboarding";

/**
 * The guest chat on the sign-in page: "How can we help you grow?", then the sign-up questions one at
 * a time (the same basics and rules as the sign-up form), then the AI's recommendation.
 */
export type GuestStep = {
  key: string;
  ask: (p: Record<string, string>) => string;
  kind: "text" | "choice" | "select" | "number";
  options?: readonly { value: string; label: string }[];
  /** Can be skipped (stored as empty). */
  optional?: boolean;
  /** Only asked when this returns true. */
  when?: (p: Record<string, string>) => boolean;
  placeholder?: string;
};

export const OPENING = "How can we help you grow?";
const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const first = (p: Record<string, string>) => p.name?.split(" ")[0] ?? "";

export const GUEST_STEPS: readonly GuestStep[] = [
  { key: "challenge", ask: () => OPENING, kind: "text", placeholder: "e.g. Our pipeline isn't converting and I'm not sure whether to hire another AE." },
  { key: "name", ask: () => "Got it. A few quick questions first, so the answer fits your company. What's your name?", kind: "text", placeholder: "Your name" },
  { key: "companyName", ask: (p) => `Thanks${first(p) ? `, ${first(p)}` : ""}. What's your company called?`, kind: "text", placeholder: "Company name" },
  { key: "revenueBand", ask: () => "Roughly what's your annual revenue? A ballpark is fine, like $800k, $2M or $15M.", kind: "choice", options: REVENUE_BANDS, placeholder: "e.g. about $2M" },
  { key: "foundedYear", ask: () => "What year was it founded?", kind: "select", options: opts(FOUNDING_YEARS), placeholder: "e.g. 2021" },
  { key: "stage", ask: () => "What's your funding stage: bootstrapped, pre-seed, seed, Series A, or Series B and later?", kind: "choice", options: opts(FUNDING_STAGES), placeholder: "e.g. Seed" },
  { key: "vertical", ask: () => "What vertical are you in? For example fintech, healthtech, security or HR tech.", kind: "choice", options: opts(VERTICALS), placeholder: "e.g. Fintech" },
  { key: "verticalOther", ask: () => "Which vertical, in a few words?", kind: "text", when: (p) => p.vertical === "Other", placeholder: "e.g. Customer experience" },
  { key: "aes", ask: () => "How many account executives (people who close deals) do you have? 0 if it's just you.", kind: "number", placeholder: "e.g. 3" },
  { key: "bdrs", ask: () => "And BDRs or SDRs (people who book meetings)? Say skip if you'd rather not.", kind: "number", optional: true, placeholder: "e.g. 2, or skip" },
  { key: "cs", ask: () => "Last one: how many in customer success?", kind: "number", optional: true, placeholder: "e.g. 1, or skip" },
];

/** The next question to ask, or null once every applicable one is answered. */
export function nextStep(profile: Record<string, string>): GuestStep | null {
  return GUEST_STEPS.find((s) => (!s.when || s.when(profile)) && !(s.key in profile)) ?? null;
}

const fieldSchema: Record<string, (v: string) => string | null> = {
  challenge: (v) => (v.length < 3 ? "Tell us a little more." : v.length > 2000 ? "Please keep it under 2,000 characters." : null),
  name: (v) => (!v ? "Enter your name." : v.length > 120 ? "That's too long." : null),
  companyName: (v) => (!v ? "Enter your company name." : v.length > 160 ? "That's too long." : null),
  verticalOther: (v) => (!v ? "Tell us your vertical." : v.length > 120 ? "That's too long." : null),
};

/** Checks one answer; returns the value to store or an error message. */
export function checkAnswer(step: GuestStep, raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim();
  if (step.optional && v === "") return { ok: true, value: "" };
  if (step.options) return step.options.some((o) => o.value === v) ? { ok: true, value: v } : { ok: false, error: "Choose one of the options." };
  if (step.kind === "number") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isInteger(n) && n >= 0 && n <= 9999 ? { ok: true, value: String(n) } : { ok: false, error: "Enter a whole number, e.g. 3." };
  }
  const problem = fieldSchema[step.key]?.(v) ?? null;
  return problem ? { ok: false, error: problem } : { ok: true, value: v };
}

/**
 * A typed reply read as the answer to a question ("about $2M", "we're seed", "fintech", "just me").
 * Returns the profile values to store, or what to say back in the chat when it isn't clear.
 */
export function interpretAnswer(step: GuestStep, raw: string): { ok: true; values: Record<string, string> } | { ok: false; reply: string } {
  const read = understand(step, raw);
  if (read === null) return { ok: false, reply: CLARIFY[step.key] ?? "Sorry, I didn't catch that. Could you say it another way?" };
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(read)) {
    const target = GUEST_STEPS.find((s) => s.key === key)!;
    const checked = checkAnswer(target, value);
    if (!checked.ok) return { ok: false, reply: checked.error };
    values[key] = checked.value;
  }
  return { ok: true, values };
}

const CLARIFY: Record<string, string> = {
  revenueBand: "I didn't catch a revenue figure. Roughly what's your annual revenue? Something like \"under $1M\", \"$2M\" or \"$15M\" is fine.",
  foundedYear: "Which year was that? Just the year is fine, like 2021.",
  stage: "Which stage is closest: bootstrapped, pre-seed, seed, Series A, or Series B and later?",
  vertical: "Which vertical is that closest to? For example fintech, healthtech, security, HR tech, or describe it in a few words.",
  aes: "How many account executives is that, as a number? 0 if it's just you.",
  bdrs: "How many BDRs or SDRs, as a number? Or say skip.",
  cs: "How many in customer success, as a number? Or say skip.",
};

/** The company basics from a finished guest profile, validated by the sign-up rules. */
export function basicsFrom(profile: Record<string, string>): CompanyBasics | null {
  const parsed = companyBasicsSchema.safeParse({
    companyName: profile.companyName ?? "",
    revenueBand: profile.revenueBand ?? "",
    foundedYear: profile.foundedYear ?? "",
    vertical: profile.vertical ?? "",
    verticalOther: profile.verticalOther ?? "",
    stage: profile.stage ?? "",
    aes: profile.aes ?? "",
    bdrs: profile.bdrs ?? "",
    cs: profile.cs ?? "",
  });
  return parsed.success ? parsed.data : null;
}
