CREATE TYPE "public"."billing_cycle" AS ENUM('one_time', 'monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'active', 'ended');--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "contract_status" DEFAULT 'active' NOT NULL,
	"billing_cycle" "billing_cycle" DEFAULT 'monthly' NOT NULL,
	"amount_cents" integer,
	"start_date" date,
	"end_date" date,
	"next_billing_date" date,
	"blob_url" text,
	"filename" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_company_idx" ON "contracts" USING btree ("company_id");