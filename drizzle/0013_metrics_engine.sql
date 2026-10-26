CREATE TYPE "public"."data_point_origin" AS ENUM('manual', 'extracted', 'calculated');--> statement-breakpoint
CREATE TYPE "public"."plan_action_status" AS ENUM('not_started', 'in_progress', 'done', 'dropped');--> statement-breakpoint
CREATE TABLE "plan_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"company_use_case_id" uuid NOT NULL,
	"deliverable_id" uuid NOT NULL,
	"priority" integer NOT NULL,
	"action" text NOT NULL,
	"rationale" text,
	"timing" text,
	"role" text,
	"success_metric" text,
	"metric" text,
	"baseline_value" numeric,
	"baseline_period" text,
	"expected_signal" text,
	"risks" text,
	"status" "plan_action_status" DEFAULT 'not_started' NOT NULL,
	"note" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_points" ADD COLUMN "origin" "data_point_origin" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_points" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "data_points" ADD COLUMN "calc" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "analysis" jsonb;--> statement-breakpoint
ALTER TABLE "plan_actions" ADD CONSTRAINT "plan_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_actions" ADD CONSTRAINT "plan_actions_company_use_case_id_company_use_cases_id_fk" FOREIGN KEY ("company_use_case_id") REFERENCES "public"."company_use_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_actions" ADD CONSTRAINT "plan_actions_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_actions" ADD CONSTRAINT "plan_actions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_actions_company_use_case_idx" ON "plan_actions" USING btree ("company_use_case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_actions_deliverable_priority_idx" ON "plan_actions" USING btree ("deliverable_id","priority");--> statement-breakpoint
-- Existing figures from documents were read by the model.
UPDATE "data_points" SET "origin" = 'extracted' WHERE "document_id" IS NOT NULL;
