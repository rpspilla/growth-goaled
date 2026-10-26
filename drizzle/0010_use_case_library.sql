CREATE TYPE "public"."use_case_activation" AS ENUM('paid', 'advisor');--> statement-breakpoint
CREATE TYPE "public"."use_case_status" AS ENUM('objective', 'active', 'baseline_in_review', 'tracking', 'closed');--> statement-breakpoint
CREATE TABLE "company_use_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"use_case" text NOT NULL,
	"status" "use_case_status" DEFAULT 'objective' NOT NULL,
	"objective" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"objective_updated_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"activated_by" uuid,
	"activation" "use_case_activation",
	"activation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "use_case" text;--> statement-breakpoint
ALTER TABLE "company_use_cases" ADD CONSTRAINT "company_use_cases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_use_cases" ADD CONSTRAINT "company_use_cases_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_use_cases_company_use_case_idx" ON "company_use_cases" USING btree ("company_id","use_case");--> statement-breakpoint
-- Existing paid benchmark unlocks become an active Growth Leak use case (HANDOFF §13.6).
INSERT INTO "company_use_cases" ("company_id", "use_case", "status", "activated_at", "activation", "activation_note")
SELECT "id", 'growth_leak', 'active', "benchmark_unlocked_at", 'paid', 'Migrated from the preliminary Benchmark unlock'
FROM "companies" WHERE "benchmark_unlocked_at" IS NOT NULL
ON CONFLICT ("company_id", "use_case") DO NOTHING;--> statement-breakpoint
UPDATE "payments" SET "use_case" = 'growth_leak' WHERE "purpose" = 'benchmark_unlock' AND "use_case" IS NULL;
