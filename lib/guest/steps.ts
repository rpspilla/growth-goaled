import { FOUNDING_YEARS, FUNDING_STAGES, VERTICALS } from "@/lib/intake";
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
  { key: "revenueBand", ask: () => "Roughly what's your annual revenue?", kind: "choice", options: REVENUE_BANDS },
  { key: "foundedYear", ask: () => "When was it founded?", kind: "select", options: opts(FOUNDING_YEARS) },
  { key: "stage", ask: () => "What's your funding stage?", kind: "choice", options: opts(FUNDING_STAGES) },
  { key: "vertical", ask: () => "Which vertical are you in?", kind: "choice", options: opts(VERTICALS) },
  { key: "verticalOther", ask: () => "Which vertical, in a few words?", kind: "text", when: (p) => p.vertical === "Other", placeholder: "e.g. Customer experience" },
  { key: "aes", ask: () => "How many account executives (people who close deals) do you have? 0 if it's just you.", kind: "number", placeholder: "e.g. 3" },
  { key: "bdrs", ask: () => "And BDRs or SDRs (people who book meetings)?", kind: "number", optional: true, placeholder: "e.g. 2" },
  { key: "cs", ask: () => "Last one: how many in customer success?", kind: "number", optional: true, placeholder: "e.g. 1" },
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

/** The founder's display text for an answer (labels for choices). */
export const answerLabel = (step: GuestStep, value: string) => (value === "" ? "Skip" : (step.options?.find((o) => o.value === value)?.label ?? value));

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
