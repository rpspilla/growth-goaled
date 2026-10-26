CREATE TYPE "public"."advisory_request_status" AS ENUM('new', 'contacted', 'closed');--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'failed';--> statement-breakpoint
CREATE TABLE "advisory_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"use_case" text,
	"message" text,
	"status" "advisory_request_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "advisory_requests" ADD CONSTRAINT "advisory_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisory_requests" ADD CONSTRAINT "advisory_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advisory_requests_company_idx" ON "advisory_requests" USING btree ("company_id");