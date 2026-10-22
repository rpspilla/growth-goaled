CREATE TYPE "public"."agent_kind" AS ENUM('draft', 'qa', 'extract');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."benchmark_metric_status" AS ENUM('proposed', 'approved', 'retired');--> statement-breakpoint
CREATE TYPE "public"."benchmark_source_type" AS ENUM('public', 'advisory');--> statement-breakpoint
CREATE TYPE "public"."claim_source_kind" AS ENUM('data_point', 'benchmark_metric', 'document', 'methodology');--> statement-breakpoint
CREATE TYPE "public"."company_health" AS ENUM('good', 'watch', 'critical');--> statement-breakpoint
CREATE TYPE "public"."company_phase" AS ENUM('intake', 'upload', 'benchmark', 'baseline', 'icp', 'channels', 'hiring', 'complete');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."data_point_status" AS ENUM('proposed', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."deliverable_status" AS ENUM('drafting', 'qa', 'in_review', 'changes_requested', 'approved', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."deliverable_type" AS ENUM('benchmark', 'baseline', 'icp', 'channels', 'hiring');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('uploaded', 'analyzing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('board_deck', 'financial_model', 'customer_list', 'gtm_plan', 'sales_deck', 'hiring_plan', 'other');--> statement-breakpoint
CREATE TYPE "public"."intake_section" AS ENUM('company', 'customers', 'gtm', 'icp', 'hiring');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."register_owner" AS ENUM('founder', 'advisor');--> statement-breakpoint
CREATE TYPE "public"."register_status" AS ENUM('open', 'resolved', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."register_type" AS ENUM('missing', 'question', 'conflict', 'assumption', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('approve', 'request_changes', 'send_back');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('founder', 'advisor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."value_source" AS ENUM('manual', 'extracted');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deliverable_id" uuid,
	"document_id" uuid,
	"agent" "agent_kind" NOT NULL,
	"model" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'running' NOT NULL,
	"input_hash" text,
	"output" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"error" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"description" text,
	"company_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"p25" numeric,
	"median" numeric,
	"p75" numeric,
	"sample_size" integer,
	"source_id" uuid,
	"period" text,
	"status" "benchmark_metric_status" DEFAULT 'proposed' NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"publisher" text,
	"url" text,
	"year" integer,
	"type" "benchmark_source_type" NOT NULL,
	"licence_note" text,
	"imported_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"kind" "claim_source_kind" NOT NULL,
	"ref_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deliverable_id" uuid NOT NULL,
	"claim_key" text NOT NULL,
	"text" text NOT NULL,
	"confidence" "confidence",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"industry" text,
	"stage" text,
	"arr" numeric,
	"growth_pct" numeric,
	"funding" numeric,
	"employees" integer,
	"customers" integer,
	"acv" numeric,
	"nrr" numeric,
	"grr" numeric,
	"sales_cycle_days" integer,
	"primary_segment" text,
	"sales_model" text,
	"founder_led" boolean,
	"phase" "company_phase" DEFAULT 'intake' NOT NULL,
	"health" "company_health",
	"advisor_id" uuid,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"member_role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rubric_id" uuid NOT NULL,
	"computed_score" numeric,
	"breakdown" jsonb,
	"override_score" numeric,
	"override_note" text,
	"computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"value" numeric NOT NULL,
	"unit" text NOT NULL,
	"raw_text" text,
	"period" text,
	"document_id" uuid,
	"page" integer,
	"confidence" "confidence" NOT NULL,
	"status" "data_point_status" DEFAULT 'proposed' NOT NULL,
	"accepted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "deliverable_type" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "deliverable_status" DEFAULT 'drafting' NOT NULL,
	"content" jsonb,
	"headline" text,
	"created_by_run" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"doc_type" "doc_type" NOT NULL,
	"blob_url" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"status" "doc_status" DEFAULT 'uploaded' NOT NULL,
	"error" text,
	"uploaded_by" uuid,
	"data_points_found" integer DEFAULT 0 NOT NULL,
	"assumptions_flagged" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"company_id" uuid,
	"name" text NOT NULL,
	"props" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"section" "intake_section" NOT NULL,
	"field" text NOT NULL,
	"value" jsonb,
	"source" "value_source" DEFAULT 'manual' NOT NULL,
	"data_point_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"company_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "register_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "register_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"data_point_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "register_status" DEFAULT 'open' NOT NULL,
	"resolution" jsonb,
	"owner" "register_owner" DEFAULT 'founder' NOT NULL,
	"remind_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deliverable_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"qa_results" jsonb,
	"decision" "review_decision",
	"comment" text,
	"reviewer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advisor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"criteria" jsonb NOT NULL,
	"labels" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'founder' NOT NULL,
	"auth_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_metrics" ADD CONSTRAINT "benchmark_metrics_cohort_id_benchmark_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."benchmark_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_metrics" ADD CONSTRAINT "benchmark_metrics_source_id_benchmark_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."benchmark_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_metrics" ADD CONSTRAINT "benchmark_metrics_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD CONSTRAINT "benchmark_sources_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_sources" ADD CONSTRAINT "claim_sources_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_advisor_id_users_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_scores" ADD CONSTRAINT "company_scores_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_scores" ADD CONSTRAINT "company_scores_rubric_id_score_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."score_rubrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_points" ADD CONSTRAINT "data_points_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_points" ADD CONSTRAINT "data_points_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_points" ADD CONSTRAINT "data_points_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_responses" ADD CONSTRAINT "intake_responses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_responses" ADD CONSTRAINT "intake_responses_data_point_id_data_points_id_fk" FOREIGN KEY ("data_point_id") REFERENCES "public"."data_points"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_items" ADD CONSTRAINT "register_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_rubrics" ADD CONSTRAINT "score_rubrics_advisor_id_users_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_deliverable_idx" ON "agent_runs" USING btree ("deliverable_id");--> statement-breakpoint
CREATE INDEX "benchmark_metrics_cohort_status_idx" ON "benchmark_metrics" USING btree ("cohort_id","status");--> statement-breakpoint
CREATE INDEX "claim_sources_claim_idx" ON "claim_sources" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_deliverable_key_idx" ON "claims" USING btree ("deliverable_id","claim_key");--> statement-breakpoint
CREATE INDEX "companies_advisor_id_idx" ON "companies" USING btree ("advisor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_members_company_user_idx" ON "company_members" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "company_members_user_idx" ON "company_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "data_points_company_metric_idx" ON "data_points" USING btree ("company_id","metric");--> statement-breakpoint
CREATE UNIQUE INDEX "deliverables_company_type_version_idx" ON "deliverables" USING btree ("company_id","type","version");--> statement-breakpoint
CREATE INDEX "deliverables_status_idx" ON "deliverables" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_company_idx" ON "documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "events_name_created_idx" ON "events" USING btree ("name","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_responses_company_section_field_idx" ON "intake_responses" USING btree ("company_id","section","field");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_hash_idx" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "register_items_company_status_idx" ON "register_items" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "reviews_deliverable_idx" ON "reviews" USING btree ("deliverable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_user_id_idx" ON "users" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (lower("email"));