import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, CroIntelligence, CroPhilosophy, CroProfile, CroStyle, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { INTELLIGENCE_TYPES, PHILOSOPHY_FIELDS, STYLE_FIELDS, selectIntelligence, slugify, type IntelligenceBundle, type Query, type RecordForRetrieval } from "@/lib/cro";

/**
 * Multi-CRO intelligence (Nov 23, 2026). CRO profiles and their intelligence records.
 *
 * Who can do what: admins create CRO profiles, link them to a login, publish them and edit anything.
 * A CRO (an advisor linked to a profile) edits their own profile, writes records attributed to
 * themselves, submits them, and endorses or disputes other CROs' records. Validating, rejecting and
 * retiring is for admins, or a CRO reviewing a record that isn't theirs. Founders only ever see
 * published CROs, and the AI only ever uses validated records.
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type Actor = Pick<User, "id" | "role">;
const clean = (v: string | null | undefined, max = 4000) => v?.trim().slice(0, max) || null;
const tags = (v: string[] | undefined, max = 30) => [...new Set((v ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, max);

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function listCroProfiles(opts: { published?: boolean } = {}): Promise<CroProfile[]> {
  return db
    .select()
    .from(schema.croProfiles)
    .where(opts.published ? eq(schema.croProfiles.status, "published") : undefined)
    .orderBy(asc(schema.croProfiles.name));
}

export async function getCroProfile(idOrSlug: string): Promise<CroProfile | null> {
  const byId = /^[0-9a-f-]{36}$/.test(idOrSlug);
  const [p] = await db
    .select()
    .from(schema.croProfiles)
    .where(byId ? eq(schema.croProfiles.id, idOrSlug) : eq(schema.croProfiles.slug, idOrSlug))
    .limit(1);
  return p ?? null;
}

/** A published CRO founders can talk to (null for a draft, missing or unknown one). */
export async function publishedCro(idOrSlug: string): Promise<CroProfile | null> {
  const p = await getCroProfile(idOrSlug);
  return p?.status === "published" ? p : null;
}

/** The CRO profile linked to this login, if any. */
export async function croForUser(userId: string): Promise<CroProfile | null> {
  const [p] = await db.select().from(schema.croProfiles).where(eq(schema.croProfiles.userId, userId)).limit(1);
  return p ?? null;
}

const canEditProfile = (actor: Actor, p: Pick<CroProfile, "userId"> | null) => actor.role === "admin" || (p !== null && p.userId === actor.id);

export type ProfileInput = {
  name: string;
  headline?: string;
  photoUrl?: string;
  bio?: string;
  careerHistory?: string;
  accomplishments?: string;
  industries?: string[];
  stages?: string[];
  companyTypes?: string[];
  functions?: string[];
  expertise?: string[];
  websiteUrl?: string;
  availableForAdvisory?: boolean;
  philosophy?: CroPhilosophy;
  style?: CroStyle;
};

const httpsOrNull = (v: string | undefined) => {
  const t = clean(v, 500);
  if (!t) return { ok: true as const, value: null };
  try {
    const u = new URL(t);
    return u.protocol === "https:" ? { ok: true as const, value: u.toString() } : { ok: false as const };
  } catch {
    return { ok: false as const };
  }
};

function pickSections<K extends string>(raw: Partial<Record<K, string>> | undefined, keys: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const k of keys) {
    const v = clean(raw?.[k], 3000);
    if (v) out[k] = v;
  }
  return out;
}

/** Create (admins) or update (admins, or the CRO themselves) a profile. Status and login link are separate. */
export async function saveCroProfile(actor: Actor, id: string | null, input: ProfileInput): Promise<Result<{ id: string }>> {
  const existing = id ? await getCroProfile(id) : null;
  if (id && !existing) return { ok: false, error: "That CRO wasn't found." };
  if (id ? !canEditProfile(actor, existing) : actor.role !== "admin") return { ok: false, error: "Only an admin or the CRO can change this profile." };
  const name = clean(input.name, 120);
  if (!name) return { ok: false, error: "Enter the CRO's name." };
  const photo = httpsOrNull(input.photoUrl);
  const site = httpsOrNull(input.websiteUrl);
  if (!photo.ok) return { ok: false, error: "Use an https:// link for the photo." };
  if (!site.ok) return { ok: false, error: "Use an https:// link for the website profile." };
  const values = {
    name,
    headline: clean(input.headline, 200),
    photoUrl: photo.value,
    bio: clean(input.bio),
    careerHistory: clean(input.careerHistory),
    accomplishments: clean(input.accomplishments),
    industries: tags(input.industries),
    stages: tags(input.stages),
    companyTypes: tags(input.companyTypes),
    functions: tags(input.functions),
    expertise: tags(input.expertise?.map((e) => e.toLowerCase())),
    websiteUrl: site.value,
    availableForAdvisory: Boolean(input.availableForAdvisory),
    philosophy: pickSections(input.philosophy, Object.keys(PHILOSOPHY_FIELDS) as (keyof typeof PHILOSOPHY_FIELDS)[]),
    style: pickSections(input.style, Object.keys(STYLE_FIELDS) as (keyof typeof STYLE_FIELDS)[]),
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(schema.croProfiles).set(values).where(eq(schema.croProfiles.id, existing.id));
    return { ok: true, id: existing.id };
  }
  // A unique slug from the name: "jane-doe", then "jane-doe-2"…
  const base = slugify(name);
  const taken = new Set((await db.select({ slug: schema.croProfiles.slug }).from(schema.croProfiles)).map((r) => r.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const [p] = await db.insert(schema.croProfiles).values({ ...values, slug, createdBy: actor.id }).returning({ id: schema.croProfiles.id });
  await track("cro_profile_created", { userId: actor.id, props: {} });
  return { ok: true, id: p!.id };
}

/** Admins: publish or unpublish, keep in or out of the Collective, and link the CRO's login (an advisor or admin). */
export async function setCroProfileAdmin(actor: Actor, id: string, input: { status: "draft" | "published"; inCollective: boolean; userId: string | null }): Promise<Result> {
  if (actor.role !== "admin") return { ok: false, error: "Only an admin can publish CROs or link logins." };
  const p = await getCroProfile(id);
  if (!p) return { ok: false, error: "That CRO wasn't found." };
  if (input.userId) {
    const [u] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
    if (!u || u.role === "founder") return { ok: false, error: "Link an advisor or admin login." };
    const [other] = await db.select({ id: schema.croProfiles.id }).from(schema.croProfiles).where(and(eq(schema.croProfiles.userId, input.userId), ne(schema.croProfiles.id, id))).limit(1);
    if (other) return { ok: false, error: "That login is already linked to another CRO." };
  }
  if (input.status === "published" && !p.bio?.trim()) return { ok: false, error: "Add a biography before publishing: founders see it." };
  await db.update(schema.croProfiles).set({ status: input.status, inCollective: input.inCollective, userId: input.userId, updatedAt: new Date() }).where(eq(schema.croProfiles.id, id));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Intelligence records
// ---------------------------------------------------------------------------

export type RecordView = CroIntelligence & { primaryCroName: string | null; stances: { croId: string; croName: string; stance: "author" | "co_author" | "endorses" | "disputes"; note: string | null }[]; validatedByName: string | null };

/** Records with their attribution, newest first; optionally filtered. */
export async function listIntelligence(f: { type?: string; croId?: string; status?: CroIntelligence["status"]; ids?: string[] } = {}): Promise<RecordView[]> {
  if (f.ids && !f.ids.length) return [];
  const rows = await db
    .select({ r: schema.croIntelligence, croName: schema.croProfiles.name, validator: schema.users.name, validatorEmail: schema.users.email })
    .from(schema.croIntelligence)
    .leftJoin(schema.croProfiles, eq(schema.croProfiles.id, schema.croIntelligence.primaryCroId))
    .leftJoin(schema.users, eq(schema.users.id, schema.croIntelligence.validatedBy))
    .where(
      and(
        ...(f.type && f.type in INTELLIGENCE_TYPES ? [eq(schema.croIntelligence.type, f.type as CroIntelligence["type"])] : []),
        ...(f.status ? [eq(schema.croIntelligence.status, f.status)] : []),
        ...(f.ids ? [inArray(schema.croIntelligence.id, f.ids)] : []),
      ),
    )
    .orderBy(desc(schema.croIntelligence.updatedAt));
  const ids = rows.map((x) => x.r.id);
  const stances = ids.length
    ? await db
        .select({ recordId: schema.croIntelligenceContributors.recordId, croId: schema.croIntelligenceContributors.croId, croName: schema.croProfiles.name, stance: schema.croIntelligenceContributors.stance, note: schema.croIntelligenceContributors.note })
        .from(schema.croIntelligenceContributors)
        .innerJoin(schema.croProfiles, eq(schema.croProfiles.id, schema.croIntelligenceContributors.croId))
        .where(inArray(schema.croIntelligenceContributors.recordId, ids))
        .orderBy(asc(schema.croIntelligenceContributors.createdAt))
    : [];
  const out = rows.map(({ r, croName, validator, validatorEmail }) => ({
    ...r,
    primaryCroName: croName,
    validatedByName: r.validatedBy ? validator || validatorEmail : null,
    stances: stances.filter((s) => s.recordId === r.id).map(({ croId, croName, stance, note }) => ({ croId, croName, stance, note })),
  }));
  // A CRO's records: theirs, co-written, endorsed or disputed by them.
  return f.croId ? out.filter((r) => r.primaryCroId === f.croId || r.stances.some((s) => s.croId === f.croId)) : out;
}

export async function getIntelligence(id: string): Promise<RecordView | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await listIntelligence({ ids: [id] }))[0] ?? null;
}

export type RecordInput = {
  type: string;
  category?: string;
  title: string;
  content: string;
  tags?: string[];
  stages?: string[];
  industries?: string[];
  companyTypes?: string[];
  expertise?: string[];
  /** The CRO it's attributed to; null = a collective position (admins only). */
  primaryCroId: string | null;
  classification: "individual" | "collective" | "multi";
  coAuthorIds?: string[];
  source?: string;
  evidence: "opinion" | "experience" | "case_evidence" | "data";
  relatedIds?: string[];
  modes: ("individual" | "collective")[];
};

/**
 * Write or edit a record. A CRO writes records attributed to themselves; admins write for anyone,
 * or a collective position. Editing a validated record makes a new version that needs validating
 * again (the AI keeps using nothing from it until then).
 */
export async function saveIntelligence(actor: Actor, id: string | null, input: RecordInput): Promise<Result<{ id: string }>> {
  const mine = await croForUser(actor.id);
  const existing = id ? await getIntelligence(id) : null;
  if (id && !existing) return { ok: false, error: "That record wasn't found." };
  if (!(input.type in INTELLIGENCE_TYPES)) return { ok: false, error: "Pick the record type." };
  const title = clean(input.title, 200);
  const content = clean(input.content, 8000);
  if (!title) return { ok: false, error: "Give it a title." };
  if (!content) return { ok: false, error: "Write the content." };
  if (!input.modes.length) return { ok: false, error: "Choose where it can be used: an individual CRO's conversations, the Collective, or both." };
  if (input.classification === "collective" && input.primaryCroId) return { ok: false, error: "A collective position isn't attributed to one CRO." };
  if (input.classification !== "collective" && !input.primaryCroId) return { ok: false, error: "Pick the CRO it's attributed to." };
  if (input.classification === "multi" && !(input.coAuthorIds ?? []).filter((c) => c !== input.primaryCroId).length) return { ok: false, error: "Add the other contributing CROs." };
  if (actor.role !== "admin") {
    if (!mine) return { ok: false, error: "Your login isn't linked to a CRO profile yet. Ask an admin." };
    if (input.primaryCroId !== mine.id) return { ok: false, error: "You can only write records attributed to yourself." };
    if (existing && existing.primaryCroId !== mine.id) return { ok: false, error: "You can only edit your own records." };
  }
  if (input.primaryCroId && !(await getCroProfile(input.primaryCroId))) return { ok: false, error: "That CRO wasn't found." };
  const related = tags(input.relatedIds, 20).filter((r) => /^[0-9a-f-]{36}$/.test(r) && r !== id);

  const values = {
    type: input.type as CroIntelligence["type"],
    category: clean(input.category, 120),
    title,
    content,
    tags: tags(input.tags?.map((t) => t.toLowerCase())),
    stages: tags(input.stages),
    industries: tags(input.industries),
    companyTypes: tags(input.companyTypes),
    expertise: tags(input.expertise?.map((e) => e.toLowerCase())),
    primaryCroId: input.primaryCroId,
    classification: input.classification,
    source: clean(input.source, 500),
    evidence: input.evidence,
    relatedIds: related,
    modes: [...new Set(input.modes)],
    updatedAt: new Date(),
  };
  let recordId: string;
  if (existing) {
    const changed = existing.content !== content || existing.title !== title;
    const revalidate = changed && existing.status === "validated";
    await db
      .update(schema.croIntelligence)
      .set({ ...values, ...(revalidate ? { status: "submitted" as const, version: existing.version + 1, validatedBy: null, validatedAt: null } : {}) })
      .where(eq(schema.croIntelligence.id, existing.id));
    recordId = existing.id;
  } else {
    const [r] = await db.insert(schema.croIntelligence).values({ ...values, createdBy: actor.id }).returning({ id: schema.croIntelligence.id });
    recordId = r!.id;
    await track("cro_intelligence_created", { userId: actor.id, props: { type: input.type } });
  }
  // Attribution: the primary CRO is the author; co-authors as given (kept in step with the form).
  const coAuthors = tags(input.coAuthorIds).filter((c) => c !== input.primaryCroId && /^[0-9a-f-]{36}$/.test(c));
  await db.delete(schema.croIntelligenceContributors).where(and(eq(schema.croIntelligenceContributors.recordId, recordId), inArray(schema.croIntelligenceContributors.stance, ["author", "co_author"])));
  const authors = [...(input.primaryCroId ? [{ croId: input.primaryCroId, stance: "author" as const }] : []), ...coAuthors.map((croId) => ({ croId, stance: "co_author" as const }))];
  if (authors.length) {
    // An author's own endorsement or dispute gives way to their authorship.
    await db.delete(schema.croIntelligenceContributors).where(and(eq(schema.croIntelligenceContributors.recordId, recordId), inArray(schema.croIntelligenceContributors.croId, authors.map((a) => a.croId))));
    await db.insert(schema.croIntelligenceContributors).values(authors.map((a) => ({ recordId, croId: a.croId, stance: a.stance })));
  }
  return { ok: true, id: recordId };
}

/**
 * Move a record through review. The author submits (or takes it back to draft); validating,
 * rejecting and retiring are for admins or another CRO, never the author themselves.
 */
export async function setIntelligenceStatus(actor: Actor, id: string, status: CroIntelligence["status"]): Promise<Result> {
  const r = await getIntelligence(id);
  if (!r) return { ok: false, error: "That record wasn't found." };
  const mine = await croForUser(actor.id);
  const isAuthor = Boolean(mine && (r.primaryCroId === mine.id || r.stances.some((s) => s.croId === mine.id && (s.stance === "author" || s.stance === "co_author"))));
  if (status === "draft" || status === "submitted") {
    if (!isAuthor && actor.role !== "admin") return { ok: false, error: "Only its author or an admin can do that." };
  } else if (actor.role !== "admin" && (isAuthor || !mine)) {
    return { ok: false, error: isAuthor ? "Another CRO or an admin validates your records." : "Only CROs and admins review records." };
  }
  const now = new Date();
  await db
    .update(schema.croIntelligence)
    .set({ status, updatedAt: now, ...(status === "validated" ? { validatedBy: actor.id, validatedAt: now, reviewedAt: now } : status === "rejected" || status === "retired" ? { reviewedAt: now } : {}) })
    .where(eq(schema.croIntelligence.id, id));
  await track("cro_intelligence_status", { userId: actor.id, props: { status } });
  return { ok: true };
}

/** A CRO independently endorses or disputes (with why) another record, or withdraws their stance. */
export async function setStance(actor: Actor, recordId: string, stance: "endorses" | "disputes" | null, note: string | null): Promise<Result> {
  const mine = await croForUser(actor.id);
  if (!mine) return { ok: false, error: "Your login isn't linked to a CRO profile yet." };
  const r = await getIntelligence(recordId);
  if (!r) return { ok: false, error: "That record wasn't found." };
  if (r.stances.some((s) => s.croId === mine.id && (s.stance === "author" || s.stance === "co_author"))) return { ok: false, error: "You wrote this one." };
  const why = clean(note, 1000);
  if (stance === "disputes" && !why) return { ok: false, error: "Say how you see it differently: the Collective uses your reasoning." };
  await db.delete(schema.croIntelligenceContributors).where(and(eq(schema.croIntelligenceContributors.recordId, recordId), eq(schema.croIntelligenceContributors.croId, mine.id)));
  if (stance) await db.insert(schema.croIntelligenceContributors).values({ recordId, croId: mine.id, stance, note: why });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// What the AI CRO reads in a conversation
// ---------------------------------------------------------------------------

/**
 * The intelligence for one turn. A conversation with a CRO: their profile and the records they hold.
 * The Collective: the most relevant validated records of published CROs in the Collective, and
 * network positions. Null when there's nothing to add (no CROs or records yet).
 */
export async function intelligenceFor(company: Pick<Company, "stage" | "industry">, croId: string | null, q: Omit<Query, "stage" | "industry">): Promise<IntelligenceBundle | null> {
  const query: Query = { ...q, stage: company.stage, industry: company.industry };
  const cro = croId ? await publishedCro(croId) : null;
  const validated = await listIntelligence({ status: "validated" });
  const profiles = await listCroProfiles({ published: true });
  const inCollective = new Set(profiles.filter((p) => p.inCollective).map((p) => p.id));
  const asRetrieval = (r: RecordView): RecordForRetrieval => r;
  if (cro) {
    const records = selectIntelligence(validated.map(asRetrieval), { kind: "individual", croId: cro.id }, query);
    return { mode: "individual", cro, records };
  }
  // Collective: network positions, and records of CROs who are published and in the Collective.
  const eligible = validated.filter((r) => (r.primaryCroId ? inCollective.has(r.primaryCroId) : true)).map((r) => ({ ...r, stances: r.stances.filter((s) => inCollective.has(s.croId)) }));
  if (!eligible.length) return null;
  const records = selectIntelligence(eligible.map(asRetrieval), { kind: "collective" }, query);
  return { mode: "collective", records, croCount: inCollective.size };
}

/** Attribution for an answer: the records it used, with their CRO, by id (only ids that exist). */
export async function attributionFor(ids: string[]): Promise<Map<string, { title: string; type: CroIntelligence["type"]; cro: string | null; evidence: CroIntelligence["evidence"] }>> {
  const unique = [...new Set(ids.filter((i) => /^[0-9a-f-]{36}$/.test(i)))];
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: schema.croIntelligence.id, title: schema.croIntelligence.title, type: schema.croIntelligence.type, evidence: schema.croIntelligence.evidence, cro: schema.croProfiles.name })
    .from(schema.croIntelligence)
    .leftJoin(schema.croProfiles, eq(schema.croProfiles.id, schema.croIntelligence.primaryCroId))
    .where(inArray(schema.croIntelligence.id, unique));
  return new Map(rows.map((r) => [r.id, { title: r.title, type: r.type, cro: r.cro, evidence: r.evidence }]));
}
