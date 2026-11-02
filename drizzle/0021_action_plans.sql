CREATE TYPE "public"."action_plan_status" AS ENUM('pending_payment', 'collecting', 'drafting', 'in_review', 'delivered', 'active', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."action_plan_tier" AS ENUM('plan', 'supported');--> statement-breakpoint
ALTER TYPE "public"."message_role" ADD VALUE 'advisor';--> statement-breakpoint
CREATE TABLE "action_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"tier" "action_plan_tier" NOT NULL,
	"status" "action_plan_status" DEFAULT 'pending_payment' NOT NULL,
	"needs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" jsonb,
	"drafting_started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"review_note" text,
	"stripe_subscription_id" text,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "author_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "document_ids" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "action_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "action_plans_conversation_idx" ON "action_plans" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "action_plans_company_idx" ON "action_plans" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "action_plans_status_idx" ON "action_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "action_plans_subscription_idx" ON "action_plans" USING btree ("stripe_subscription_id");--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;