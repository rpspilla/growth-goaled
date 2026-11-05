CREATE TYPE "public"."payment_link_status" AS ENUM('open', 'paid', 'cancelled');--> statement-breakpoint
CREATE TABLE "payment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"client_name" text,
	"client_email" text,
	"company_id" uuid,
	"created_by" uuid,
	"status" "payment_link_status" DEFAULT 'open' NOT NULL,
	"stripe_session_id" text,
	"paid_at" timestamp with time zone,
	"paid_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_links_token_idx" ON "payment_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "payment_links_created_by_idx" ON "payment_links" USING btree ("created_by");