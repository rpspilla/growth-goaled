CREATE TYPE "public"."plan_assignee" AS ENUM('founder', 'growth_goaled');--> statement-breakpoint
ALTER TABLE "plan_actions" ADD COLUMN "assignee" "plan_assignee" DEFAULT 'founder' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_actions" ADD COLUMN "assignment_sent_at" timestamp with time zone;