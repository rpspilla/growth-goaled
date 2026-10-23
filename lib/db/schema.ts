import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Shared columns
// ---------------------------------------------------------------------------

const id = () => uuid("id").primaryKey().defaultRandom();
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["founder", "advisor", "admin"]);
export const companyPhase = pgEnum("company_phase", [
  "intake",
  "upload",
  "benchmark",
  "baseline",
  "icp",
  "channels",
  "hiring",
  "complete",
]);
export const revenueBand = pgEnum("revenue_band", ["lt_1m", "1m_3m", "3m_10m", "10m_20m", "20m_50m"]);
export const companyHealth = pgEnum("company_health", ["good", "watch", "critical"]);
export const memberRole = pgEnum("member_role", ["owner", "member"]);
export const intakeSection = pgEnum("intake_section", ["company", "customers", "gtm", "icp", "hiring"]);
export const valueSource = pgEnum("value_source", ["manual", "extracted"]);
export const sortStatus = pgEnum("sort_status", ["sorting", "sorted", "failed"]);
export const docType = pgEnum("doc_type", [
  "board_deck",
  "financial_model",
  "customer_list",
  "gtm_plan",
  "sales_deck",
  "hiring_plan",
  "other",
]);
// "stored": kept and attached to the company, but in a format we don't analyse automatically (e.g. DOCX)
export const docStatus = pgEnum("doc_status", ["uploaded", "analyzing", "done", "failed", "stored"]);
export const dataCategory = pgEnum("data_category", ["financial", "customers", "pipeline", "marketing", "product", "team"]);
export const dataItemStatus = pgEnum("data_item_status", ["not_reviewed", "available", "partial", "missing", "not_applicable"]);
export const collectionMethod = pgEnum("collection_method", ["file_upload", "manual_entry", "integration"]);
export const dataQuality = pgEnum("data_quality", ["unverified", "validated", "estimated"]);
export const confidence = pgEnum("confidence", ["high", "medium", "low"]);
export const dataPointStatus = pgEnum("data_point_status", ["proposed", "accepted", "rejected"]);
export const registerType = pgEnum("register_type", ["missing", "question", "conflict", "assumption", "follow_up"]);
export const registerStatus = pgEnum("register_status", ["open", "resolved", "unknown"]);
export const registerOwner = pgEnum("register_owner", ["founder", "advisor"]);
export const benchmarkSourceType = pgEnum("benchmark_source_type", ["public", "advisory"]);
export const benchmarkMetricStatus = pgEnum("benchmark_metric_status", ["proposed", "approved", "retired"]);
export const deliverableType = pgEnum("deliverable_type", ["benchmark", "baseline", "icp", "channels", "hiring"]);
export const deliverableStatus = pgEnum("deliverable_status", [
  "drafting",
  "qa",
  "in_review",
  "changes_requested",
  "approved",
  "published",
  "failed",
]);
export const claimSourceKind = pgEnum("claim_source_kind", ["data_point", "benchmark_metric", "document", "methodology"]);
export const agentKind = pgEnum("agent_kind", ["draft", "qa", "extract", "research", "sort"]);
export const agentRunStatus = pgEnum("agent_run_status", ["running", "succeeded", "failed"]);
export const reviewDecision = pgEnum("review_decision", ["approve", "request_changes", "send_back"]);

// ---------------------------------------------------------------------------
// People and companies
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name"),
    title: text("title"),
    role: userRole("role").notNull().default("founder"),
    // Set when the first-sign-in profile (and, for founders, company) form is completed
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    // Neon Auth (Better Auth) user id from neon_auth.user
    authUserId: text("auth_user_id").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_auth_user_id_idx").on(t.authUserId), uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)],
);

export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    website: text("website"),
    industry: text("industry"),
    stage: text("stage"),
    arr: numeric("arr", { mode: "number" }),
    // Self-reported annual revenue band from onboarding; exact ARR comes from intake / data points
    revenueBand: revenueBand("revenue_band"),
    growthPct: numeric("growth_pct", { mode: "number" }),
    funding: numeric("funding", { mode: "number" }),
    employees: integer("employees"),
    customers: integer("customers"),
    acv: numeric("acv", { mode: "number" }),
    nrr: numeric("nrr", { mode: "number" }),
    grr: numeric("grr", { mode: "number" }),
    salesCycleDays: integer("sales_cycle_days"),
    primarySegment: text("primary_segment"),
    salesModel: text("sales_model"),
    founderLed: boolean("founder_led"),
    phase: companyPhase("phase").notNull().default("intake"),
    health: companyHealth("health"),
    // Null → company sits in the unassigned queue
    advisorId: uuid("advisor_id").references(() => users.id, { onDelete: "set null" }),
    // Internal advisor note on the company (never shown to founders)
    advisorSummary: text("advisor_summary"),
    advisorSummaryAt: timestamp("advisor_summary_at", { withTimezone: true }),
    advisorSummaryBy: uuid("advisor_summary_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    isSample: boolean("is_sample").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("companies_advisor_id_idx").on(t.advisorId)],
);

export const companyMembers = pgTable(
  "company_members",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberRole: memberRole("member_role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [uniqueIndex("company_members_company_user_idx").on(t.companyId, t.userId), index("company_members_user_idx").on(t.userId)],
);

export const invites = pgTable(
  "invites",
  {
    id: id(),
    email: text("email").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("invites_token_hash_idx").on(t.tokenHash)],
);

// ---------------------------------------------------------------------------
// Intake, documents, data points, registers
// ---------------------------------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    docType: docType("doc_type").notNull(),
    blobUrl: text("blob_url").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    status: docStatus("status").notNull().default("uploaded"),
    error: text("error"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    dataPointsFound: integer("data_points_found").notNull().default(0),
    assumptionsFlagged: integer("assumptions_flagged").notNull().default(0),
    // Data Readiness: which category / requirement items this file supports
    dataCategory: dataCategory("data_category"),
    dataItemKeys: text("data_item_keys").array().notNull().default(sql`'{}'::text[]`),
    // SHA-256 of the file, so re-uploading the same file reuses the existing record
    contentHash: text("content_hash"),
    // Spreadsheet/CSV shape (sheets, columns, rows, date range) computed on processing
    profile: jsonb("profile").$type<FileProfile>(),
    // "Upload whatever you have": files dropped in the inbox get item suggestions to confirm
    inbox: boolean("inbox").notNull().default(false),
    sortStatus: sortStatus("sort_status"),
    sortSummary: text("sort_summary"),
    suggestions: jsonb("suggestions").$type<SortSuggestion[]>(),
    sortReviewedAt: timestamp("sort_reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("documents_company_idx").on(t.companyId),
    uniqueIndex("documents_company_hash_idx").on(t.companyId, t.contentHash),
  ],
);

export type SortSuggestion = {
  itemKey: string;
  /** Sheet the suggestion is based on, when the file has several. */
  sheet: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
  source: "columns" | "ai" | "filename";
  status: "suggested" | "accepted" | "dismissed";
};

export type FileProfile = {
  sheets: { name: string; rows: number; columns: string[] }[];
  dateRange: { start: string; end: string } | null;
};

/**
 * Growth Data Readiness: one row per company per requirement in lib/readiness.ts.
 * Founder-reported availability and metadata; "available" never implies validated.
 */
export const dataItems = pgTable(
  "data_items",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    category: dataCategory("category").notNull(),
    itemKey: text("item_key").notNull(),
    status: dataItemStatus("status").notNull().default("not_reviewed"),
    collectionMethod: collectionMethod("collection_method"),
    sourceSystem: text("source_system"),
    integrationRef: text("integration_ref"),
    coverageStart: date("coverage_start", { mode: "string" }),
    coverageEnd: date("coverage_end", { mode: "string" }),
    quality: dataQuality("quality").notNull().default("unverified"),
    limitations: text("limitations"),
    notes: text("notes"),
    // Request from the advisor (or system) asking for more on this item
    followUp: text("follow_up"),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("data_items_company_item_idx").on(t.companyId, t.itemKey)],
);

/** Saved data-gap summaries (rule-based facts plus an optional AI-written summary of them). */
export const readinessAssessments = pgTable(
  "readiness_assessments",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    facts: jsonb("facts").notNull(),
    summary: jsonb("summary"),
    model: text("model"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("readiness_assessments_company_idx").on(t.companyId, t.createdAt)],
);

export const dataPoints = pgTable(
  "data_points",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // Key from lib/metrics.ts
    metric: text("metric").notNull(),
    value: numeric("value", { mode: "number" }).notNull(),
    unit: text("unit").notNull(),
    rawText: text("raw_text"),
    period: text("period"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    page: integer("page"),
    confidence: confidence("confidence").notNull(),
    status: dataPointStatus("status").notNull().default("proposed"),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("data_points_company_metric_idx").on(t.companyId, t.metric)],
);

export const intakeResponses = pgTable(
  "intake_responses",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    section: intakeSection("section").notNull(),
    field: text("field").notNull(),
    value: jsonb("value"),
    source: valueSource("source").notNull().default("manual"),
    dataPointId: uuid("data_point_id").references(() => dataPoints.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("intake_responses_company_section_field_idx").on(t.companyId, t.section, t.field)],
);

export const registerItems = pgTable(
  "register_items",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    type: registerType("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    dataPointIds: uuid("data_point_ids").array().notNull().default(sql`'{}'::uuid[]`),
    status: registerStatus("status").notNull().default("open"),
    resolution: jsonb("resolution"),
    owner: registerOwner("owner").notNull().default("founder"),
    remindAt: timestamp("remind_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("register_items_company_status_idx").on(t.companyId, t.status)],
);

// ---------------------------------------------------------------------------
// Benchmarks and scoring
// ---------------------------------------------------------------------------

export const benchmarkSources = pgTable("benchmark_sources", {
  id: id(),
  name: text("name").notNull(),
  publisher: text("publisher"),
  url: text("url"),
  year: integer("year"),
  type: benchmarkSourceType("type").notNull(),
  licenceNote: text("licence_note"),
  importedBy: uuid("imported_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  ...timestamps,
});

export type CohortCriteria = {
  stage?: string[];
  arr_min?: number;
  arr_max?: number;
  model?: string;
  gtm_motion?: string;
};

export const benchmarkCohorts = pgTable("benchmark_cohorts", {
  id: id(),
  name: text("name").notNull(),
  criteria: jsonb("criteria").$type<CohortCriteria>().notNull(),
  description: text("description"),
  companyCount: integer("company_count"),
  // Illustrative demo cohort for the /sample company; never matched to real companies.
  isSample: boolean("is_sample").notNull().default(false),
  ...timestamps,
});

export const benchmarkMetrics = pgTable(
  "benchmark_metrics",
  {
    id: id(),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => benchmarkCohorts.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    p25: numeric("p25", { mode: "number" }),
    median: numeric("median", { mode: "number" }),
    // Top quartile
    p75: numeric("p75", { mode: "number" }),
    sampleSize: integer("sample_size"),
    sourceId: uuid("source_id").references(() => benchmarkSources.id, { onDelete: "set null" }),
    period: text("period"),
    // Only `approved` rows may be used by agents.
    status: benchmarkMetricStatus("status").notNull().default("proposed"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("benchmark_metrics_cohort_status_idx").on(t.cohortId, t.status)],
);

export type RubricCriterion = {
  metric: string;
  weight: number;
  bands: { min: number | null; max: number | null; points: number }[];
};
export type RubricLabel = { min: number; max: number; label: string };

export const scoreRubrics = pgTable("score_rubrics", {
  id: id(),
  advisorId: uuid("advisor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  criteria: jsonb("criteria").$type<RubricCriterion[]>().notNull(),
  labels: jsonb("labels").$type<RubricLabel[]>().notNull(),
  ...timestamps,
});

export const companyScores = pgTable("company_scores", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  rubricId: uuid("rubric_id")
    .notNull()
    .references(() => scoreRubrics.id, { onDelete: "cascade" }),
  computedScore: numeric("computed_score", { mode: "number" }),
  breakdown: jsonb("breakdown"),
  overrideScore: numeric("override_score", { mode: "number" }),
  overrideNote: text("override_note"),
  computedAt: timestamp("computed_at", { withTimezone: true }),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Deliverables, claims, agents, reviews
// ---------------------------------------------------------------------------

export const deliverables = pgTable(
  "deliverables",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    type: deliverableType("type").notNull(),
    version: integer("version").notNull().default(1),
    status: deliverableStatus("status").notNull().default("drafting"),
    // Validated by the per-type Zod schema before writing
    content: jsonb("content"),
    headline: text("headline"),
    createdByRun: uuid("created_by_run"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("deliverables_company_type_version_idx").on(t.companyId, t.type, t.version),
    index("deliverables_status_idx").on(t.status),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: id(),
    deliverableId: uuid("deliverable_id")
      .notNull()
      .references(() => deliverables.id, { onDelete: "cascade" }),
    // Stable id referenced from the deliverable's content JSON
    claimKey: text("claim_key").notNull(),
    text: text("text").notNull(),
    confidence: confidence("confidence"),
    ...timestamps,
  },
  (t) => [uniqueIndex("claims_deliverable_key_idx").on(t.deliverableId, t.claimKey)],
);

export const claimSources = pgTable(
  "claim_sources",
  {
    id: id(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    kind: claimSourceKind("kind").notNull(),
    refId: uuid("ref_id"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("claim_sources_claim_idx").on(t.claimId)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    // Null for extraction runs, which belong to a document rather than a deliverable
    deliverableId: uuid("deliverable_id").references(() => deliverables.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
    // Set for benchmark research runs
    cohortId: uuid("cohort_id").references(() => benchmarkCohorts.id, { onDelete: "cascade" }),
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    agent: agentKind("agent").notNull(),
    model: text("model").notNull(),
    status: agentRunStatus("status").notNull().default("running"),
    inputHash: text("input_hash"),
    output: jsonb("output"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    ...timestamps,
  },
  (t) => [index("agent_runs_deliverable_idx").on(t.deliverableId)],
);

export type QaResults = Record<
  "data_consistency" | "benchmark_methodology" | "source_trail" | "recommendation_logic" | "missing_inputs",
  { result: "pass" | "fail"; note?: string }
>;

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    deliverableId: uuid("deliverable_id")
      .notNull()
      .references(() => deliverables.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    qaResults: jsonb("qa_results").$type<QaResults>(),
    decision: reviewDecision("decision"),
    comment: text("comment"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("reviews_deliverable_idx").on(t.deliverableId)],
);

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    props: jsonb("props"),
    ...timestamps,
  },
  (t) => [index("events_name_created_idx").on(t.name, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Role = (typeof userRole.enumValues)[number];
export type Company = typeof companies.$inferSelect;
