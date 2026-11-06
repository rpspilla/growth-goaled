CREATE TYPE "public"."plan_session_kind" AS ENUM('review', 'support');--> statement-breakpoint
CREATE TABLE "plan_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"advisor_id" uuid,
	"kind" "plan_session_kind" NOT NULL,
	"minutes" integer NOT NULL,
	"held_on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_sessions" ADD CONSTRAINT "plan_sessions_plan_id_action_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."action_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_sessions" ADD CONSTRAINT "plan_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_sessions" ADD CONSTRAINT "plan_sessions_advisor_id_users_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_sessions_plan_idx" ON "plan_sessions" USING btree ("plan_id","held_on");