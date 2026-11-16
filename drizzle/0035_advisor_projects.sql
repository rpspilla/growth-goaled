CREATE TYPE "public"."growth_project_status" AS ENUM('open', 'completed');--> statement-breakpoint
CREATE TYPE "public"."project_document_kind" AS ENUM('action_plan', 'document');--> statement-breakpoint
CREATE TABLE "growth_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "growth_project_status" DEFAULT 'open' NOT NULL,
	"started_on" date NOT NULL,
	"completed_on" date,
	"company_use_case_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "project_document_kind" DEFAULT 'document' NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"blob_url" text,
	"filename" text,
	"mime" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" text,
	"note" text,
	"position" integer DEFAULT 0 NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_priorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"title" text NOT NULL,
	"action" text NOT NULL,
	"due_on" date,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "growth_projects" ADD CONSTRAINT "growth_projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_projects" ADD CONSTRAINT "growth_projects_company_use_case_id_company_use_cases_id_fk" FOREIGN KEY ("company_use_case_id") REFERENCES "public"."company_use_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_projects" ADD CONSTRAINT "growth_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_growth_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."growth_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_results" ADD CONSTRAINT "project_results_project_id_growth_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."growth_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_results" ADD CONSTRAINT "project_results_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_results" ADD CONSTRAINT "project_results_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_results" ADD CONSTRAINT "project_results_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_priorities" ADD CONSTRAINT "weekly_priorities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_priorities" ADD CONSTRAINT "weekly_priorities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "growth_projects_company_idx" ON "growth_projects" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_projects_use_case_idx" ON "growth_projects" USING btree ("company_use_case_id");--> statement-breakpoint
CREATE INDEX "project_documents_project_idx" ON "project_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_results_project_idx" ON "project_results" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "weekly_priorities_company_week_idx" ON "weekly_priorities" USING btree ("company_id","week_start");--> statement-breakpoint
-- Every growth project already started (activated) carries over as an advisor-managed project, open,
-- from the day it started. Advisors mark them completed.
INSERT INTO "growth_projects" ("company_id", "name", "status", "started_on", "company_use_case_id")
SELECT cu."company_id",
  CASE cu."use_case"
    WHEN 'hire_or_fix' THEN 'Growth Hiring Plan'
    WHEN 'growth_leak' THEN 'Fix Churn'
    WHEN 'winning_icp' THEN 'Repeatable Sales Motion'
    WHEN 'series_a_ready' THEN 'Series A Readiness'
    WHEN 'series_b_ready' THEN 'Series B Readiness'
    WHEN 'founder_handoff' THEN 'Investor Update'
    ELSE cu."use_case"
  END,
  'open', cu."activated_at"::date, cu."id"
FROM "company_use_cases" cu
WHERE cu."activated_at" IS NOT NULL
ON CONFLICT DO NOTHING;
