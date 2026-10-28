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
/** manual: the founder entered it; extracted: read from a document by the model; calculated: computed in code from the founder's rows. */
export const dataPointOrigin = pgEnum("data_point_origin", ["manual", "extracted", "calculated"]);
export const planActionStatus = pgEnum("plan_action_status", ["not_started", "in_progress", "done", "dropped"]);
export const registerType = pgEnum("register_type", ["missing", "question", "conflict", "assumption", "follow_up"]);
export const registerStatus = pgEnum("register_status", ["open", "resolved", "unknown"]);
export const registerOwner = pgEnum("register_owner", ["founder", "advisor"]);
export const benchmarkSourceType = pgEnum("benchmark_source_type", ["public", "advisory"]);
export const benchmarkMetricStatus = pgEnum("benchmark_metric_status", ["proposed", "approved", "retired"]);
// Benchmark Library (dataset versions and records)
export const benchmarkSourceKind = pgEnum("benchmark_source_kind", ["published_report", "licensed_dataset", "internal_research", "aggregated_customer"]);
export const benchmarkReliability = pgEnum("benchmark_reliability", ["unverified", "reliable", "use_with_caution", "unreliable"]);
export const benchmarkVersionStatus = pgEnum("benchmark_version_status", ["draft", "validated", "published", "archived"]);
export const benchmarkStatistic = pgEnum("benchmark_statistic", ["median", "mean", "percentile", "min", "max", "range"]);
export const benchmarkValueType = pgEnum("benchmark_value_type", ["percentage", "currency", "ratio", "duration", "count", "other"]);
export const benchmarkUnit = pgEnum("benchmark_unit", ["percent", "usd", "ratio", "days", "months", "count", "other"]);
export const benchmarkPeriodBasis = pgEnum("benchmark_period_basis", ["annual", "trailing_12_months", "quarterly", "monthly", "point_in_time", "other"]);
export const benchmarkImportStatus = pgEnum("benchmark_import_status", ["committed", "failed"]);
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
export const claimSourceKind = pgEnum("claim_source_kind", ["data_point", "benchmark_metric", "document", "methodology", "founder_answer", "analysis", "benchmark_record"]);
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
    // When the founder paid to see the preliminary Benchmark
    benchmarkUnlockedAt: timestamp("benchmark_unlocked_at", { withTimezone: true }),
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
    // Set when the file was imported from a Google Sheets / Docs / Slides / Drive link
    sourceUrl: text("source_url"),
    sortStatus: sortStatus("sort_status"),
    sortSummary: text("sort_summary"),
    suggestions: jsonb("suggestions").$type<SortSuggestion[]>(),
    sortReviewedAt: timestamp("sort_reviewed_at", { withTimezone: true }),
    // Deterministic analysis of tabular files (lib/metrics-engine): bridge, segments, monthly series, warnings
    analysis: jsonb("analysis").$type<import("@/lib/metrics-engine").FileAnalysis>(),
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
  /** labels: text down the first column (row headers), when present */
  sheets: { name: string; rows: number; columns: string[]; labels?: string[] }[];
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
    origin: dataPointOrigin("origin").notNull().default("manual"),
    // For calculated figures: the method in plain words, and the sheet/columns/sample it used
    method: text("method"),
    calc: jsonb("calc").$type<{ sheet: string; rows: number; columns: string[]; sampleSize?: number }>(),
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
  // Benchmark Library provenance and licensing (legacy cohort rows use `type` above)
  kind: benchmarkSourceKind("kind").notNull().default("published_report"),
  documentRef: text("document_ref"),
  publishedOn: date("published_on"),
  collectionPeriod: text("collection_period"),
  attribution: text("attribution"),
  // Licence terms: off until an admin confirms the licence allows it
  allowCustomerDisplay: boolean("allow_customer_display").notNull().default(false),
  allowDerived: boolean("allow_derived").notNull().default(false),
  reliability: benchmarkReliability("reliability").notNull().default("unverified"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  // How often the publisher updates it, and when datasets from it are due for review
  updateFrequency: text("update_frequency"),
  reviewIntervalDays: integer("review_interval_days"),
  // Required for aggregated customer data before any dataset from it can be published
  consentReference: text("consent_reference"),
  minAggregationSize: integer("min_aggregation_size"),
  // One of the fixed sources every free Snapshot's peer comparisons are drawn from
  snapshotSource: boolean("snapshot_source").notNull().default(false),
  // Growth Goaled's own standard reference: assumptions used only when no other data fits, always labelled as such
  standardReference: boolean("standard_reference").notNull().default(false),
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

// Benchmark Library: source → dataset → immutable published versions → records

export const benchmarkDatasets = pgTable(
  "benchmark_datasets",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description"),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => benchmarkSources.id, { onDelete: "restrict" }),
    companyTypes: text("company_types").array().notNull().default(sql`'{}'::text[]`),
    businessModels: text("business_models").array().notNull().default(sql`'{}'::text[]`),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("benchmark_datasets_name_idx").on(sql`lower(${t.name})`)],
);

export type BenchmarkVersionEvent = { at: string; by: string | null; action: string; note?: string };

export const benchmarkDatasetVersions = pgTable(
  "benchmark_dataset_versions",
  {
    id: id(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => benchmarkDatasets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: benchmarkVersionStatus("status").notNull().default("draft"),
    effectiveDate: date("effective_date"),
    publishedOn: date("published_on"),
    changeNote: text("change_note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    history: jsonb("history").$type<BenchmarkVersionEvent[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex("benchmark_versions_dataset_version_idx").on(t.datasetId, t.version), index("benchmark_versions_status_idx").on(t.status)],
);

export const benchmarkRecords = pgTable(
  "benchmark_records",
  {
    id: id(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => benchmarkDatasetVersions.id, { onDelete: "cascade" }),
    // A Growth Goaled metric key when it maps to one; otherwise the source's own identifier
    metric: text("metric").notNull(),
    displayName: text("display_name").notNull(),
    definition: text("definition").notNull(),
    // The admin confirmed the source's definition matches Growth Goaled's for this metric
    definitionMatches: boolean("definition_matches").notNull().default(false),
    unit: benchmarkUnit("unit").notNull(),
    valueType: benchmarkValueType("value_type").notNull(),
    statistic: benchmarkStatistic("statistic").notNull(),
    percentile: integer("percentile"),
    value: numeric("value", { mode: "number" }),
    valueLow: numeric("value_low", { mode: "number" }),
    valueHigh: numeric("value_high", { mode: "number" }),
    stages: text("stages").array().notNull().default(sql`'{}'::text[]`),
    arrMin: numeric("arr_min", { mode: "number" }),
    arrMax: numeric("arr_max", { mode: "number" }),
    industry: text("industry"),
    businessModel: text("business_model"),
    pricingModel: text("pricing_model"),
    customerSegment: text("customer_segment"),
    acvMin: numeric("acv_min", { mode: "number" }),
    acvMax: numeric("acv_max", { mode: "number" }),
    geography: text("geography"),
    // Founding years the cohort covers (inclusive), e.g. companies founded 2018–2021
    foundedFrom: integer("founded_from"),
    foundedTo: integer("founded_to"),
    period: text("period").notNull(),
    periodBasis: benchmarkPeriodBasis("period_basis").notNull(),
    cohortDefinition: text("cohort_definition"),
    sampleSize: integer("sample_size"),
    methodology: text("methodology"),
    limitations: text("limitations"),
    // Same metric, statistic, cohort and period in one version
    dedupeKey: text("dedupe_key").notNull(),
    importId: uuid("import_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("benchmark_records_dedupe_idx").on(t.versionId, t.dedupeKey), index("benchmark_records_metric_idx").on(t.metric)],
);

export type BenchmarkImportError = { line: number; field?: string; message: string };

export const benchmarkImports = pgTable(
  "benchmark_imports",
  {
    id: id(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => benchmarkDatasets.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => benchmarkDatasetVersions.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    // Private Blob copy of the uploaded file, when storage is configured
    blobUrl: text("blob_url"),
    contentHash: text("content_hash").notNull(),
    columnMap: jsonb("column_map").$type<Record<string, string>>().notNull().default({}),
    status: benchmarkImportStatus("status").notNull(),
    rowsTotal: integer("rows_total").notNull().default(0),
    rowsAccepted: integer("rows_accepted").notNull().default(0),
    rowsRejected: integer("rows_rejected").notNull().default(0),
    rowsSkipped: integer("rows_skipped").notNull().default(0),
    errors: jsonb("errors").$type<BenchmarkImportError[]>().notNull().default([]),
    importedBy: uuid("imported_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("benchmark_imports_dataset_idx").on(t.datasetId)],
);

/** Which records a report used: makes usage visible and keeps reports auditable. */
export const benchmarkUsages = pgTable(
  "benchmark_usages",
  {
    id: id(),
    deliverableId: uuid("deliverable_id")
      .notNull()
      .references(() => deliverables.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    recordId: uuid("record_id")
      .notNull()
      .references(() => benchmarkRecords.id, { onDelete: "restrict" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => benchmarkDatasetVersions.id, { onDelete: "restrict" }),
    metric: text("metric").notNull(),
    selection: text("selection").notNull(),
    quality: text("quality").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("benchmark_usages_version_idx").on(t.versionId), uniqueIndex("benchmark_usages_deliverable_record_idx").on(t.deliverableId, t.recordId)],
);

/** An advisor's explicit choice for one company and metric: a record to use, or none (null). */
export const benchmarkOverrides = pgTable(
  "benchmark_overrides",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    recordId: uuid("record_id").references(() => benchmarkRecords.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    setBy: uuid("set_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("benchmark_overrides_company_metric_idx").on(t.companyId, t.metric)],
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
    // Assessments (type "baseline"): the use case they answer (lib/use-cases)
    useCase: text("use_case"),
    version: integer("version").notNull().default(1),
    status: deliverableStatus("status").notNull().default("drafting"),
    // Validated by the per-type Zod schema before writing
    content: jsonb("content"),
    headline: text("headline"),
    createdByRun: uuid("created_by_run"),
    // Built automatically after uploads; founders can see it (once paid) before advisor review
    preliminary: boolean("preliminary").notNull().default(false),
    // Set after QA: true when the code checks (figures traced, claims sourced) all passed
    codeChecksPassed: boolean("code_checks_passed"),
    // Held for an advisor's review before the founder sees it (e.g. built with fewer than the required sales calls)
    reviewRequired: boolean("review_required").notNull().default(false),
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
// Payments
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Use case library (HANDOFF §13)
// ---------------------------------------------------------------------------

export const companyUseCaseStatus = pgEnum("use_case_status", ["objective", "active", "baseline_in_review", "tracking", "closed"]);
export const companyUseCaseActivation = pgEnum("use_case_activation", ["paid", "advisor"]);

/** A use case a company has started: the objective form, then activation (paid or by an advisor). */
export const companyUseCases = pgTable(
  "company_use_cases",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // Id from lib/use-cases
    useCase: text("use_case").notNull(),
    status: companyUseCaseStatus("status").notNull().default("objective"),
    objective: jsonb("objective").$type<Record<string, string>>().notNull().default({}),
    objectiveUpdatedAt: timestamp("objective_updated_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    activatedBy: uuid("activated_by").references(() => users.id, { onDelete: "set null" }),
    activation: companyUseCaseActivation("activation"),
    activationNote: text("activation_note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("company_use_cases_company_use_case_idx").on(t.companyId, t.useCase)],
);

/** A founder's committed action plan from an assessment, tracked over time (HANDOFF §13.8). */
export const planActions = pgTable(
  "plan_actions",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    companyUseCaseId: uuid("company_use_case_id")
      .notNull()
      .references(() => companyUseCases.id, { onDelete: "cascade" }),
    deliverableId: uuid("deliverable_id")
      .notNull()
      .references(() => deliverables.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull(),
    action: text("action").notNull(),
    rationale: text("rationale"),
    timing: text("timing"),
    role: text("role"),
    successMetric: text("success_metric"),
    // Metric key when the success measure is a tracked metric; its value when the plan was committed
    metric: text("metric"),
    baselineValue: numeric("baseline_value", { mode: "number" }),
    baselinePeriod: text("baseline_period"),
    expectedSignal: text("expected_signal"),
    risks: text("risks"),
    status: planActionStatus("status").notNull().default("not_started"),
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("plan_actions_company_use_case_idx").on(t.companyUseCaseId), uniqueIndex("plan_actions_deliverable_priority_idx").on(t.deliverableId, t.priority)],
);

export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "expired", "failed"]);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    // Use case the payment activates (null for the retired benchmark unlock)
    useCase: text("use_case"),
    stripeSessionId: text("stripe_session_id").notNull(),
    // Hosted Checkout link, reused while the session is open so repeat clicks don't create a second charge
    checkoutUrl: text("checkout_url"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("payments_session_idx").on(t.stripeSessionId), index("payments_company_idx").on(t.companyId)],
);

export const advisoryRequestStatus = pgEnum("advisory_request_status", ["new", "contacted", "closed"]);

/** Optional advisory sessions a founder asked about (when no booking link is configured, or alongside one). */
export const advisoryRequests = pgTable(
  "advisory_requests",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    useCase: text("use_case"),
    message: text("message"),
    status: advisoryRequestStatus("status").notNull().default("new"),
    ...timestamps,
  },
  (t) => [index("advisory_requests_company_idx").on(t.companyId)],
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
export type CompanyUseCase = typeof companyUseCases.$inferSelect;
