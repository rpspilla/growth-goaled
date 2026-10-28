CREATE TYPE "public"."benchmark_import_status" AS ENUM('committed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."benchmark_period_basis" AS ENUM('annual', 'trailing_12_months', 'quarterly', 'monthly', 'point_in_time', 'other');--> statement-breakpoint
CREATE TYPE "public"."benchmark_reliability" AS ENUM('unverified', 'reliable', 'use_with_caution', 'unreliable');--> statement-breakpoint
CREATE TYPE "public"."benchmark_source_kind" AS ENUM('published_report', 'licensed_dataset', 'internal_research', 'aggregated_customer');--> statement-breakpoint
CREATE TYPE "public"."benchmark_statistic" AS ENUM('median', 'mean', 'percentile', 'min', 'max', 'range');--> statement-breakpoint
CREATE TYPE "public"."benchmark_unit" AS ENUM('percent', 'usd', 'ratio', 'days', 'months', 'count', 'other');--> statement-breakpoint
CREATE TYPE "public"."benchmark_value_type" AS ENUM('percentage', 'currency', 'ratio', 'duration', 'count', 'other');--> statement-breakpoint
CREATE TYPE "public"."benchmark_version_status" AS ENUM('draft', 'validated', 'published', 'archived');--> statement-breakpoint
ALTER TYPE "public"."claim_source_kind" ADD VALUE 'benchmark_record';--> statement-breakpoint
CREATE TABLE "benchmark_dataset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "benchmark_version_status" DEFAULT 'draft' NOT NULL,
	"effective_date" date,
	"published_on" date,
	"change_note" text,
	"created_by" uuid,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_id" uuid NOT NULL,
	"company_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"business_models" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"version_id" uuid,
	"filename" text NOT NULL,
	"blob_url" text,
	"content_hash" text NOT NULL,
	"column_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "benchmark_import_status" NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"rows_accepted" integer DEFAULT 0 NOT NULL,
	"rows_rejected" integer DEFAULT 0 NOT NULL,
	"rows_skipped" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"imported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"record_id" uuid,
	"reason" text NOT NULL,
	"set_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"display_name" text NOT NULL,
	"definition" text NOT NULL,
	"definition_matches" boolean DEFAULT false NOT NULL,
	"unit" "benchmark_unit" NOT NULL,
	"value_type" "benchmark_value_type" NOT NULL,
	"statistic" "benchmark_statistic" NOT NULL,
	"percentile" integer,
	"value" numeric,
	"value_low" numeric,
	"value_high" numeric,
	"stages" text[] DEFAULT '{}'::text[] NOT NULL,
	"arr_min" numeric,
	"arr_max" numeric,
	"industry" text,
	"business_model" text,
	"pricing_model" text,
	"customer_segment" text,
	"acv_min" numeric,
	"acv_max" numeric,
	"geography" text,
	"period" text NOT NULL,
	"period_basis" "benchmark_period_basis" NOT NULL,
	"cohort_definition" text,
	"sample_size" integer,
	"methodology" text,
	"limitations" text,
	"dedupe_key" text NOT NULL,
	"import_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deliverable_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"selection" text NOT NULL,
	"quality" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "kind" "benchmark_source_kind" DEFAULT 'published_report' NOT NULL;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "document_ref" text;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "published_on" date;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "collection_period" text;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "attribution" text;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "allow_customer_display" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "allow_derived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "reliability" "benchmark_reliability" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "update_frequency" text;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "review_interval_days" integer;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "consent_reference" text;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "min_aggregation_size" integer;--> statement-breakpoint
ALTER TABLE "benchmark_dataset_versions" ADD CONSTRAINT "benchmark_dataset_versions_dataset_id_benchmark_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."benchmark_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_dataset_versions" ADD CONSTRAINT "benchmark_dataset_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_dataset_versions" ADD CONSTRAINT "benchmark_dataset_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_dataset_versions" ADD CONSTRAINT "benchmark_dataset_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_datasets" ADD CONSTRAINT "benchmark_datasets_source_id_benchmark_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."benchmark_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_datasets" ADD CONSTRAINT "benchmark_datasets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_imports" ADD CONSTRAINT "benchmark_imports_dataset_id_benchmark_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."benchmark_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_imports" ADD CONSTRAINT "benchmark_imports_version_id_benchmark_dataset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."benchmark_dataset_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_imports" ADD CONSTRAINT "benchmark_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_overrides" ADD CONSTRAINT "benchmark_overrides_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_overrides" ADD CONSTRAINT "benchmark_overrides_record_id_benchmark_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."benchmark_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_overrides" ADD CONSTRAINT "benchmark_overrides_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_records" ADD CONSTRAINT "benchmark_records_version_id_benchmark_dataset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."benchmark_dataset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_records" ADD CONSTRAINT "benchmark_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_usages" ADD CONSTRAINT "benchmark_usages_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_usages" ADD CONSTRAINT "benchmark_usages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_usages" ADD CONSTRAINT "benchmark_usages_record_id_benchmark_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."benchmark_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_usages" ADD CONSTRAINT "benchmark_usages_version_id_benchmark_dataset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."benchmark_dataset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_versions_dataset_version_idx" ON "benchmark_dataset_versions" USING btree ("dataset_id","version");--> statement-breakpoint
CREATE INDEX "benchmark_versions_status_idx" ON "benchmark_dataset_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_datasets_name_idx" ON "benchmark_datasets" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "benchmark_imports_dataset_idx" ON "benchmark_imports" USING btree ("dataset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_overrides_company_metric_idx" ON "benchmark_overrides" USING btree ("company_id","metric");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_records_dedupe_idx" ON "benchmark_records" USING btree ("version_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "benchmark_records_metric_idx" ON "benchmark_records" USING btree ("metric");--> statement-breakpoint
CREATE INDEX "benchmark_usages_version_idx" ON "benchmark_usages" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_usages_deliverable_record_idx" ON "benchmark_usages" USING btree ("deliverable_id","record_id");