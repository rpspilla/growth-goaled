import type { CroIntelligence, CroProfile } from "@/lib/db/schema";

/**
 * Multi-CRO intelligence (Nov 23, 2026): vocabulary, retrieval and the block the AI CRO reads.
 * Retrieval is plain scoring over tags, expertise, stage, industry and evidence (no vector store):
 * the library is small and every record is curated, so this stays explainable and testable.
 */

export const INTELLIGENCE_TYPES = {
  principle: "CRO principle",
  behavioral_rule: "Behavioral rule",
  diagnostic_framework: "Diagnostic framework",
  decision_framework: "Decision framework",
  scenario: "Scenario",
  conversation_example: "Conversation example",
  case_study: "Case study",
  benchmark: "Benchmark",
  outcome: "Outcome",
  correction: "Correction",
  lesson_learned: "Lesson learned",
  perspective: "CRO opinion or perspective",
} as const satisfies Record<CroIntelligence["type"], string>;
export type IntelligenceType = keyof typeof INTELLIGENCE_TYPES;

export const EVIDENCE_LEVELS = { opinion: "Opinion", experience: "Experience", case_evidence: "Case evidence", data: "Data" } as const satisfies Record<CroIntelligence["evidence"], string>;
export const INTELLIGENCE_STATUSES = { draft: "Draft", submitted: "Submitted for review", validated: "Validated", rejected: "Rejected", retired: "Retired" } as const satisfies Record<CroIntelligence["status"], string>;
export const CLASSIFICATIONS = { individual: "One CRO's view", collective: "Growth Goaled network position", multi: "Several CROs' joint work" } as const satisfies Record<CroIntelligence["classification"], string>;

/** Expertise tags (searchable); CROs and records can add others. */
export const EXPERTISE = [
  "sales",
  "marketing",
  "gtm strategy",
  "product-market fit",
  "icp",
  "positioning",
  "pricing",
  "revenue operations",
  "sales hiring",
  "organizational design",
  "customer success",
  "retention",
  "partnerships",
  "fundraising",
  "growth strategy",
  "compensation",
  "founder-led sales",
  "pipeline",
] as const;
export const INDUSTRIES = ["SaaS", "AI", "Fintech", "Healthcare", "Marketplace", "Developer tools", "Cybersecurity", "Vertical SaaS"] as const;
export const STAGES = ["Pre-seed", "Seed", "Series A", "Series B", "Growth"] as const;

export const PHILOSOPHY_FIELDS = {
  coreBeliefs: "Core beliefs",
  growth: "Growth philosophy",
  decisionPrinciples: "Decision-making principles",
  leadership: "Leadership approach",
  sales: "Sales philosophy",
  gtm: "GTM philosophy",
  hiring: "Views on hiring",
  capital: "Views on capital allocation",
  scaling: "Views on scaling",
  founderChallenges: "Approach to common founder challenges",
} as const;
export const STYLE_FIELDS = {
  communication: "Communication style",
  directness: "Level of directness",
  coaching: "Coaching style",
  challenge: "Willingness to challenge",
  analyticalVsIntuitive: "Analytical vs intuitive",
  strategicVsTactical: "Strategic vs tactical",
  diagnosticMethods: "Preferred diagnostic methods",
  decisionApproach: "Decision-making approach",
  exampleInTheirWords: "An answer in their own words (example)",
} as const;

/** Which expertise each conversation starter draws on (lib/chat/topics.ts ids). */
export const TOPIC_EXPERTISE: Record<string, readonly string[]> = {
  revenue_engine: ["gtm strategy", "icp", "positioning", "pipeline", "sales", "revenue operations", "growth strategy"],
  first_gtm_hire: ["sales hiring", "founder-led sales", "organizational design", "sales"],
  hiring_profiles: ["sales hiring", "organizational design", "compensation"],
  sales_pay: ["compensation", "sales hiring"],
  sales_equity: ["compensation", "sales hiring", "fundraising"],
  quota: ["sales", "revenue operations", "compensation"],
  commission: ["compensation", "sales", "revenue operations"],
  fundraising: ["fundraising", "growth strategy"],
  more_salespeople: ["sales hiring", "organizational design", "pipeline", "founder-led sales"],
  pipeline_conversion: ["pipeline", "sales", "icp", "revenue operations"],
  retention_efficiency: ["retention", "customer success", "pricing"],
  other: [],
};

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "cro";

/** "a, b ,c" → ["a","b","c"] (trimmed, lowercased tags, no duplicates). */
export const parseTags = (raw: string, lower = true) => [...new Set(raw.split(",").map((t) => (lower ? t.trim().toLowerCase() : t.trim())).filter(Boolean))].slice(0, 30);

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export type Stance = { croId: string; croName: string; stance: "author" | "co_author" | "endorses" | "disputes"; note: string | null };
export type RecordForRetrieval = Pick<CroIntelligence, "id" | "type" | "title" | "content" | "tags" | "stages" | "industries" | "expertise" | "primaryCroId" | "classification" | "evidence" | "modes" | "status" | "relatedIds" | "category"> & {
  primaryCroName: string | null;
  stances: Stance[];
};
export type Mode = { kind: "collective" } | { kind: "individual"; croId: string };
export type Query = { text: string; topicId: string; stage: string | null; industry: string | null };

const EVIDENCE_WEIGHT: Record<CroIntelligence["evidence"], number> = { opinion: 1, experience: 2, case_evidence: 3, data: 4 };
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9][a-z0-9+-]{2,}/g) ?? []);
const norm = (s: string) => s.trim().toLowerCase();

/** Whose view a record is, for a given CRO: wrote it, co-wrote it or independently endorses it. */
export const holdsView = (r: RecordForRetrieval, croId: string) => r.primaryCroId === croId || r.stances.some((s) => s.croId === croId && s.stance !== "disputes");

/**
 * How relevant a validated record is to the founder's question: its expertise against the topic's,
 * its tags and title against the question's words, stage and industry fit, and how well it's backed.
 * Agreement adds a little (capped): relevance and evidence matter more than headcount.
 */
export function relevance(r: RecordForRetrieval, q: Query): number {
  const topic = new Set(TOPIC_EXPERTISE[q.topicId] ?? []);
  const text = q.text.toLowerCase();
  const qWords = words(q.text);
  let score = 0;
  for (const e of r.expertise) if (topic.has(norm(e))) score += 3;
  for (const tag of [...r.tags, ...r.expertise]) if (tag && text.includes(norm(tag))) score += 2;
  for (const w of words(`${r.title} ${r.category ?? ""}`)) if (qWords.has(w)) score += 1;
  // Stage and industry rank records that are on topic; they never make an off-topic record relevant.
  if (score === 0) return 0;
  if (q.stage && r.stages.some((s) => norm(s) === norm(q.stage!))) score += 2;
  if (q.industry && r.industries.some((s) => norm(s) === norm(q.industry!))) score += 2;
  const endorsements = r.stances.filter((s) => s.stance === "endorses").length;
  return score + EVIDENCE_WEIGHT[r.evidence] + Math.min(endorsements, 2) * 0.5;
}

/**
 * The records an answer may draw on. Individual: only what that CRO holds (their behavioral rules
 * always, then their most relevant records); nothing from the rest of the network. Collective: the
 * most relevant validated records across CROs in the Collective, and network positions.
 */
export function selectIntelligence(records: RecordForRetrieval[], mode: Mode, q: Query, limit = 12): RecordForRetrieval[] {
  const usable = records.filter((r) => r.status === "validated" && r.modes.includes(mode.kind));
  if (mode.kind === "individual") {
    const theirs = usable.filter((r) => holdsView(r, mode.croId));
    const rules = theirs.filter((r) => r.type === "behavioral_rule").slice(0, 4);
    const rest = theirs
      .filter((r) => r.type !== "behavioral_rule")
      .map((r) => ({ r, s: relevance(r, q) + (r.type === "principle" ? 0.5 : 0) }))
      .sort((a, b) => b.s - a.s);
    // Their principles stay in view even when the question doesn't match their tags.
    const picked = rest.filter((x) => x.s > 0.5 || x.r.type === "principle").map((x) => x.r);
    return [...rules, ...picked].slice(0, limit);
  }
  return usable
    .map((r) => ({ r, s: relevance(r, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.r);
}

/** Where CROs see it differently among the chosen records: a dispute on a record, with who and why. */
export function disagreements(chosen: RecordForRetrieval[]): { recordId: string; title: string; heldBy: string; disputedBy: string; why: string | null }[] {
  return chosen.flatMap((r) =>
    r.stances
      .filter((s) => s.stance === "disputes")
      .map((s) => ({ recordId: r.id, title: r.title, heldBy: r.primaryCroName ?? "Growth Goaled network", disputedBy: s.croName, why: s.note })),
  );
}

// ---------------------------------------------------------------------------
// What the AI CRO reads
// ---------------------------------------------------------------------------

export type IntelligenceBundle =
  | { mode: "collective"; records: RecordForRetrieval[]; croCount: number }
  | { mode: "individual"; cro: Pick<CroProfile, "id" | "name" | "headline" | "bio" | "careerHistory" | "accomplishments" | "industries" | "stages" | "companyTypes" | "functions" | "expertise" | "philosophy" | "style">; records: RecordForRetrieval[] };

const recordJson = (r: RecordForRetrieval) => ({
  id: r.id,
  type: INTELLIGENCE_TYPES[r.type],
  title: r.title,
  content: r.content.slice(0, 1500),
  cro: r.primaryCroName ?? "Growth Goaled network position",
  classification: CLASSIFICATIONS[r.classification],
  evidence: EVIDENCE_LEVELS[r.evidence],
  stages: r.stages,
  industries: r.industries,
  endorsed_by: r.stances.filter((s) => s.stance === "endorses" || s.stance === "co_author").map((s) => s.croName),
  disputed_by: r.stances.filter((s) => s.stance === "disputes").map((s) => ({ cro: s.croName, why: s.note })),
});

export const INDIVIDUAL_RULES = (name: string) => `CRO MODE: the founder chose to talk to ${name}'s AI representation. You are an AI informed by ${name}'s documented expertise, not ${name} personally; never claim to be them.
- ${name}'s profile, philosophy, communication style and records below are your primary source of judgment. Reason the way they do, in their style.
- Use only what's documented. Never invent experiences, clients, companies, credentials, numbers or opinions for ${name}. You may say "${name}'s view is…" or "in ${name}'s experience…" only when a record or the profile says so.
- When their documented intelligence doesn't cover the question, say so plainly, then give your best general CRO judgment, clearly labelled as general, not as ${name}'s view. Don't pull in other CROs' views unless the founder asks for the Collective.
- List in intelligence_used every record you relied on (its id) and how.`;

export const COLLECTIVE_RULES = `CRO MODE: the Growth Goaled Collective. You draw on the documented intelligence of several CROs in the Growth Goaled network (records below, each attributed).
- Synthesize, don't concatenate. Find where the relevant CROs agree, and use that.
- When perspectives differ materially for this founder's question, don't force consensus and don't stage a debate: name the difference in a sentence or two, the assumption behind each view, which fits this company's context and why, and what evidence would change your recommendation. Put them in the card's perspectives (fits: true for the one you recommend).
- Weigh relevance to this company, evidence level and experience over how many CROs hold a view.
- Attribute by CRO name when it helps the founder trust or weigh a point; never invent a CRO, a record or an endorsement.
- List in intelligence_used every record you relied on (its id) and how.`;

/** The block added to the AI CRO's context: the mode's rules, then the profile (individual) and records. */
export function intelligenceBlock(b: IntelligenceBundle): string {
  if (b.mode === "individual") {
    const { cro } = b;
    const profile = {
      name: cro.name,
      headline: cro.headline,
      bio: cro.bio,
      career_history: cro.careerHistory,
      accomplishments: cro.accomplishments,
      industries: cro.industries,
      stages: cro.stages,
      company_types: cro.companyTypes,
      functions: cro.functions,
      expertise: cro.expertise,
      philosophy: Object.fromEntries(Object.entries(cro.philosophy).filter(([, v]) => v?.trim()).map(([k, v]) => [PHILOSOPHY_FIELDS[k as keyof typeof PHILOSOPHY_FIELDS] ?? k, v])),
      communication: Object.fromEntries(Object.entries(cro.style).filter(([, v]) => v?.trim()).map(([k, v]) => [STYLE_FIELDS[k as keyof typeof STYLE_FIELDS] ?? k, v])),
    };
    return `${INDIVIDUAL_RULES(cro.name)}\n\nCRO PROFILE (JSON):\n${JSON.stringify(profile)}\n\nCRO INTELLIGENCE (JSON; ${b.records.length ? "validated records" : "none documented for this question yet"}):\n${JSON.stringify(b.records.map(recordJson))}`;
  }
  return `${COLLECTIVE_RULES}\n\nCRO INTELLIGENCE (JSON; validated records from ${b.croCount} CRO${b.croCount === 1 ? "" : "s"}${b.records.length ? "" : "; none matched this question, so rely on general CRO judgment and say so"}):\n${JSON.stringify(b.records.map(recordJson))}\n\nDISAGREEMENTS AMONG THESE RECORDS (JSON):\n${JSON.stringify(disagreements(b.records))}`;
}

/**
 * The CROs strongest on a question (expertise matching): each CRO's three most relevant validated
 * records they hold, summed; CROs with nothing relevant are left out. Best first.
 */
export function matchCros(records: RecordForRetrieval[], croIds: string[], q: Query, limit = 3): string[] {
  return croIds
    .map((id) => {
      const scores = records
        .filter((r) => r.status === "validated" && r.modes.includes("individual") && holdsView(r, id))
        .map((r) => relevance(r, q))
        .filter((x) => x > 0)
        .sort((a, b) => b - a)
        .slice(0, 3);
      return { id, score: scores.reduce((a, b) => a + b, 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.id);
}
