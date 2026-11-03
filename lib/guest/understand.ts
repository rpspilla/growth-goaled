import { FOUNDING_YEARS, FUNDING_STAGES, VERTICALS } from "@/lib/intake";
import { REVENUE_BANDS } from "@/lib/onboarding";
import type { GuestStep } from "./steps";

/**
 * Reads a typed chat reply as the answer to one sign-up question, so the guest chat needs no buttons
 * or dropdowns. Returns the profile values to store (raw option values), or null when it can't tell.
 */
export function understand(step: GuestStep, raw: string): Record<string, string> | null {
  const text = raw.trim();
  const t = text.toLowerCase();
  if (step.optional && (t === "" || SKIP.test(t))) return { [step.key]: "" };
  if (step.kind === "text") return { [step.key]: text };
  const exact = step.options?.find((o) => o.value.toLowerCase() === t || o.label.toLowerCase() === t);
  if (exact) return { [step.key]: exact.value };
  switch (step.key) {
    case "revenueBand":
      return wrap(step.key, revenueBand(t));
    case "foundedYear":
      return wrap(step.key, foundedYear(t));
    case "stage":
      return wrap(step.key, stage(t));
    case "vertical":
      return vertical(text);
    default:
      return step.kind === "number" ? wrap(step.key, count(t)) : null;
  }
}

const wrap = (key: string, v: string | null) => (v === null ? null : { [key]: v });
const SKIP = /^(skip|pass|n\/?a|none of your business|not sure|unsure|don'?t know|dunno|no idea|rather not( say)?|-+)\.?$/;

const WORDS: Record<string, number> = { zero: 0, none: 0, no: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, couple: 2, few: 3 };

/** "3", "three", "a couple", "just me", "none" → a whole number. */
export function count(input: string): string | null {
  const t = input.toLowerCase();
  if (/^(no|nobody|no one|none|zero|nil|not yet|not any)\b/.test(t) || /\b(just|only) (me|myself|us founders|the founders?)\b/.test(t) || /\bit'?s (just )?me\b/.test(t)) return "0";
  const digits = t.replace(/,/g, "").match(/\d+/);
  if (digits) return String(Number(digits[0]));
  for (const word of t.split(/[^a-z]+/)) if (word in WORDS && word !== "a" && word !== "an") return String(WORDS[word]);
  return null;
}

/** "$2M", "about 800k", "1-3 million", "pre-revenue" → a revenue band. */
export function revenueBand(input: string): string | null {
  const t = input.toLowerCase();
  if (/pre[- ]?revenue|no revenue|not yet|nothing yet|^(none|zero|0|\$0)$/.test(t)) return "lt_1m";
  const s = t.replace(/,/g, "");
  const unitOf = (u: string | undefined) => (!u ? null : /^(k|thousand)/.test(u) ? 1e3 : /^(m|mm|mil|million)/.test(u) ? 1e6 : /^(b|bn|billion)/.test(u) ? 1e9 : null);
  const found = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(k|thousand|mm|mil|million|m|bn|billion|b)?\b/g)].map((m) => ({ n: Number(m[1]), unit: unitOf(m[2]) }));
  if (!found.length) return /under|less than|below|small/.test(s) && /million|\bm\b/.test(s) ? "lt_1m" : null;
  const shared = found.find((f) => f.unit !== null)?.unit ?? null;
  const dollars = found.map((f) => {
    const unit = f.unit ?? shared;
    if (unit) return f.n * unit;
    // A bare number: big ones are dollars, small ones are millions ("about 2").
    return f.n >= 1000 ? f.n : f.n <= 100 ? f.n * 1e6 : null;
  });
  if (dollars.some((d) => d === null)) return null;
  const values = dollars as number[];
  let v = (Math.min(...values) + Math.max(...values)) / 2;
  if (/under|less than|below|<|up to/.test(s)) v = Math.min(...values) - 1;
  return v < 1e6 ? "lt_1m" : v < 3e6 ? "1m_3m" : v < 10e6 ? "3m_10m" : v < 20e6 ? "10m_20m" : REVENUE_BANDS.at(-1)!.value;
}

/** "2021", "founded in 2019", "last year", "3 years ago" → a founding year. */
export function foundedYear(input: string): string | null {
  const t = input.toLowerCase();
  const now = Number(FOUNDING_YEARS[0]);
  const year = t.match(/\b(1[89]\d{2}|20\d{2})\b/);
  if (year) {
    const y = Number(year[1]);
    if (y > now) return null;
    return y < 1990 ? FOUNDING_YEARS.at(-1)! : String(y);
  }
  if (/this year|just started|brand new/.test(t)) return String(now);
  if (/last year/.test(t)) return String(now - 1);
  const ago = t.match(/(\d+|[a-z]+)\s+years?\s+ago/);
  const n = ago ? (/^\d+$/.test(ago[1]!) ? Number(ago[1]) : WORDS[ago[1]!]) : undefined;
  return n !== undefined && n >= 0 && now - n >= 1990 ? String(now - n) : null;
}

/** "we're seed", "raised a series A", "self-funded" → a funding stage. */
export function stage(input: string): (typeof FUNDING_STAGES)[number] | null {
  const t = input.toLowerCase();
  if (/bootstrap|self[- ]?funded|no funding|not raised|haven'?t raised|never raised|profitable|no outside/.test(t)) return "Bootstrapped";
  if (/pre[- ]?seed|angel|friends and family/.test(t)) return "Pre-seed";
  if (/series\s*[b-z]\b|series b\+|growth stage|later stage|late stage/.test(t)) return "Series B+";
  if (/series\s*a\b|\ban a round\b/.test(t)) return "Series A";
  if (/\bseed\b/.test(t)) return "Seed";
  return null;
}

const VERTICAL_WORDS: [RegExp, (typeof VERTICALS)[number]][] = [
  [/\b(ai|a\.i\.|artificial intelligence|machine learning|ml|llm|automation)\b/, "AI / Automation"],
  [/fin ?tech|financ|payments?|banking|lending|insur|accounting|crypto|wealth/, "Fintech"],
  [/health|medic|clinic|pharma|biotech|patient|hospital|wellness/, "HealthTech"],
  [/retail|cpg|consumer goods|e-?commerce|d2c|dtc|brands?\b|shopping/, "Retail & CPG"],
  [/logistic|supply chain|freight|shipping|fleet|warehous|transport/, "Logistics & supply chain"],
  [/manufactur|industrial|factory|construction|energy|hardware/, "Manufacturing & industrial"],
  [/real estate|prop ?tech|property|mortgage|housing/, "Real estate & proptech"],
  [/educat|ed ?tech|learning|school|universit|training/, "Education"],
  [/\bhr\b|hr ?tech|human resources|workforce|recruit|hiring|payroll|people ops|talent/, "HR & workforce"],
  [/marketing|martech|sales ?tech|sales tools?|\bcrm\b|advertis|revops|go-to-market|gtm/, "Marketing & sales tech"],
  [/secur|cyber|identity|compliance|privacy|fraud/, "Security"],
  [/professional services|consult|agency|legal ?tech|law firm|services firm/, "Professional services"],
];

/** "we sell to banks" → Fintech; anything unrecognised is kept as their own words under Other. */
export function vertical(text: string): Record<string, string> | null {
  const t = text.toLowerCase();
  const exact = VERTICALS.find((v) => v.toLowerCase() === t);
  if (exact) return exact === "Other" ? { vertical: "Other" } : { vertical: exact };
  const hit = VERTICAL_WORDS.find(([re]) => re.test(t));
  if (hit) return { vertical: hit[1] };
  if (t.length < 3 || t.length > 120 || !/[a-z]/.test(t)) return null;
  return { vertical: "Other", verticalOther: text.replace(/^(we'?re|we are|it'?s|in)\s+(an?\s+)?/i, "").trim() };
}
