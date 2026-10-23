CREATE TYPE "public"."collection_method" AS ENUM('file_upload', 'manual_entry', 'integration');--> statement-breakpoint
CREATE TYPE "public"."data_category" AS ENUM('financial', 'customers', 'pipeline', 'marketing', 'product', 'team');--> statement-breakpoint
CREATE TYPE "public"."data_item_status" AS ENUM('not_reviewed', 'available', 'partial', 'missing', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."data_quality" AS ENUM('unverified', 'validated', 'estimated');--> statement-breakpoint
ALTER TYPE "public"."doc_status" ADD VALUE 'stored';--> statement-breakpoint
CREATE TABLE "data_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category" "data_category" NOT NULL,
	"item_key" text NOT NULL,
	"status" "data_item_status" DEFAULT 'not_reviewed' NOT NULL,
	"collection_method" "collection_method",
	"source_system" text,
	"integration_ref" text,
	"coverage_start" date,
	"coverage_end" date,
	"quality" "data_quality" DEFAULT 'unverified' NOT NULL,
	"limitations" text,
	"notes" text,
	"follow_up" text,
	"last_reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readiness_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"facts" jsonb NOT NULL,
	"summary" jsonb,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "data_category" "data_category";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "data_item_keys" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "profile" jsonb;--> statement-breakpoint
ALTER TABLE "data_items" ADD CONSTRAINT "data_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_items" ADD CONSTRAINT "data_items_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_assessments" ADD CONSTRAINT "readiness_assessments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_assessments" ADD CONSTRAINT "readiness_assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_items_company_item_idx" ON "data_items" USING btree ("company_id","item_key");--> statement-breakpoint
CREATE INDEX "readiness_assessments_company_idx" ON "readiness_assessments" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_company_hash_idx" ON "documents" USING btree ("company_id","content_hash");