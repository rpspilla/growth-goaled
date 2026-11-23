CREATE TYPE "public"."commitment_status" AS ENUM('open', 'done', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('proposed', 'committed');--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"recommendation_id" uuid,
	"conversation_id" uuid,
	"title" text NOT NULL,
	"owner" text NOT NULL,
	"due_on" date,
	"measure" text,
	"status" "commitment_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "growth_projects" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "growth_projects" ADD COLUMN "recommendation_id" uuid;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "status" "recommendation_status" DEFAULT 'proposed' NOT NULL;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_project_id_growth_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."growth_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commitments_company_status_idx" ON "commitments" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "commitments_project_idx" ON "commitments" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "growth_projects" ADD CONSTRAINT "growth_projects_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_projects" ADD CONSTRAINT "growth_projects_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE set null ON UPDATE no action;