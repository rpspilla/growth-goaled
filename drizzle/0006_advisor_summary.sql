ALTER TABLE "companies" ADD COLUMN "advisor_summary" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "advisor_summary_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "advisor_summary_by" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_advisor_summary_by_users_id_fk" FOREIGN KEY ("advisor_summary_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;