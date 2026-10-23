CREATE TYPE "public"."sort_status" AS ENUM('sorting', 'sorted', 'failed');--> statement-breakpoint
ALTER TYPE "public"."agent_kind" ADD VALUE 'sort';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "inbox" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "sort_status" "sort_status";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "sort_summary" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "suggestions" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "sort_reviewed_at" timestamp with time zone;