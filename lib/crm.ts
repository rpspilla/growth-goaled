/** The internal CRM's fixed lists and pure rules (shared by pages, actions and tests). */

export const DEFAULT_STAGES = [
  { name: "New Prospects", kind: "new" },
  { name: "Researching", kind: "researching" },
  { name: "Ready to Contact", kind: "ready" },
  { name: "Contacted", kind: "contacted" },
  { name: "In Conversation", kind: "conversation" },
  { name: "Opportunity", kind: "opportunity" },
  { name: "Customer / Partner", kind: "won" },
  { name: "Not Now / Archived", kind: "archived" },
] as const;

/** Who a contact is to Growth Goaled, with the finer types under each. */
export const CATEGORIES = {
  Founder: ["Pre-seed", "Seed", "Series A", "Series B"],
  Advisor: ["Fractional CRO", "Fractional CMO", "GTM consultant", "Startup advisor"],
  Investor: ["Venture capital firm", "Angel investor", "Venture partner", "Accelerator"],
  Partner: ["Startup community", "Service provider", "Strategic partner", "Ecosystem organization"],
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_NAMES = Object.keys(CATEGORIES) as Category[];

export const SOURCES = ["LinkedIn", "Referral", "Website", "Website chat", "Existing network", "Event", "Investor introduction", "Other"] as const;

export const OPPORTUNITIES = ["Potential customer", "Potential referral source", "Potential distribution partner", "Potential advisor", "Potential investor", "General relationship"] as const;

export const COMPANY_STAGES = ["Pre-seed", "Seed", "Series A", "Series B", "Other"] as const;

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };

/** Quick picks for a contact's next action. */
export const NEXT_ACTIONS = ["Send introductory email", "Follow up", "Schedule discovery call", "Share Growth Goaled", "Send proposal", "Check back next quarter"] as const;

/** Interactions that can be logged from a profile (each also counts as being in touch). */
export const INTERACTIONS = [
  { kind: "note", label: "Note", contact: false },
  { kind: "call", label: "Call", contact: true },
  { kind: "meeting", label: "Meeting", contact: true },
  { kind: "email_sent", label: "Email sent (outside the CRM)", contact: true },
  { kind: "other", label: "Other interaction", contact: true },
] as const;

export const normalizeEmail = (v: string | null | undefined) => {
  const e = v?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
};

/** "https://www.Acme.com/about" → "acme.com" (null when it isn't a web address). */
export function domainOf(website: string | null | undefined): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|pm|gmx|zoho|yandex|mail|fastmail|hey)\./;

/** The company domain behind a work email ("ann@acme.com" → "acme.com"); null for personal mailboxes. */
export function workDomain(email: string | null | undefined): string | null {
  const d = email?.trim().toLowerCase().split("@")[1];
  return d && d.includes(".") && !FREE_MAIL.test(d) ? d : null;
}

export const fullName = (c: { firstName: string; lastName: string | null }) => [c.firstName, c.lastName].filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export type FollowUpBucket = "overdue" | "today" | "upcoming" | "later" | "none";

/** Where a follow-up date sits relative to today (YYYY-MM-DD strings). "Upcoming" is the next 7 days. */
export function followUpBucket(due: string | null, today: string): FollowUpBucket {
  if (!due) return "none";
  if (due < today) return "overdue";
  if (due === today) return "today";
  const week = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  return due <= week ? "upcoming" : "later";
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

export type ImportRow = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  company: string | null;
  website: string | null;
  linkedinUrl: string | null;
  location: string | null;
  category: string | null;
  source: string | null;
  notes: string | null;
};

const HEADERS: Record<keyof ImportRow | "name", string[]> = {
  name: ["name", "full name", "contact", "contact name"],
  firstName: ["first name", "firstname", "first", "given name"],
  lastName: ["last name", "lastname", "last", "surname", "family name"],
  email: ["email", "email address", "e mail", "work email"],
  phone: ["phone", "phone number", "mobile", "telephone"],
  jobTitle: ["title", "job title", "role", "position"],
  company: ["company", "company name", "organization", "organisation", "account"],
  website: ["website", "company website", "url", "domain"],
  linkedinUrl: ["linkedin", "linkedin url", "linkedin profile"],
  location: ["location", "city", "country"],
  category: ["category", "contact type", "type"],
  source: ["source", "lead source"],
  notes: ["notes", "note", "comments"],
};

/**
 * Reads CSV rows (first row = headers, matched by common names) into contacts. Rows without a name
 * or email are skipped; a "Name" column is split into first and last.
 */
export function mapImportRows(rows: string[][]): { rows: ImportRow[]; skipped: number; columns: string[] } {
  const [head, ...body] = rows;
  if (!head) return { rows: [], skipped: 0, columns: [] };
  const norm = head.map((h) => h.trim().toLowerCase().replace(/[_-]+/g, " "));
  const col = (key: keyof typeof HEADERS) => norm.findIndex((h) => HEADERS[key].includes(h));
  const idx = Object.fromEntries((Object.keys(HEADERS) as (keyof typeof HEADERS)[]).map((k) => [k, col(k)])) as Record<keyof typeof HEADERS, number>;
  const get = (r: string[], k: keyof typeof HEADERS) => (idx[k] >= 0 ? r[idx[k]]?.trim() || null : null);
  const out: ImportRow[] = [];
  let skipped = 0;
  for (const r of body) {
    if (r.every((c) => !c.trim())) continue;
    let first = get(r, "firstName");
    let last = get(r, "lastName");
    const name = get(r, "name");
    if (!first && name) [first, last] = [name.split(/\s+/)[0]!, name.split(/\s+/).slice(1).join(" ") || null];
    const email = normalizeEmail(get(r, "email"));
    if (!first && email) first = email.split("@")[0]!;
    if (!first) {
      skipped++;
      continue;
    }
    out.push({ firstName: first.slice(0, 100), lastName: last?.slice(0, 100) ?? null, email, phone: get(r, "phone"), jobTitle: get(r, "jobTitle"), company: get(r, "company"), website: get(r, "website"), linkedinUrl: get(r, "linkedinUrl"), location: get(r, "location"), category: get(r, "category"), source: get(r, "source"), notes: get(r, "notes") });
  }
  return { rows: out, skipped, columns: head.filter((_, i) => Object.values(idx).includes(i)) };
}

/** A category typed in a CSV ("founders", "VC") matched to the CRM's own, or null. */
export function matchCategory(v: string | null): { category: Category; subcategory: string | null } | null {
  const t = v?.trim().toLowerCase();
  if (!t) return null;
  for (const c of CATEGORY_NAMES) {
    const sub = CATEGORIES[c].find((s) => s.toLowerCase() === t);
    if (sub) return { category: c, subcategory: sub };
    if (t === c.toLowerCase() || t === `${c.toLowerCase()}s`) return { category: c, subcategory: null };
  }
  if (/\b(vc|venture|angel|investor|fund)\b/.test(t)) return { category: "Investor", subcategory: null };
  if (/\b(cro|cmo|consultant|advisor|adviser)\b/.test(t)) return { category: "Advisor", subcategory: null };
  if (/\b(founder|ceo|co-founder)\b/.test(t)) return { category: "Founder", subcategory: null };
  if (/\b(partner|community|agency|provider)\b/.test(t)) return { category: "Partner", subcategory: null };
  return null;
}

export const matchSource = (v: string | null) => SOURCES.find((s) => s.toLowerCase() === v?.trim().toLowerCase()) ?? (v?.trim() ? "Other" : null);
