CREATE TYPE "public"."cro_profile_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."evidence_level" AS ENUM('opinion', 'experience', 'case_evidence', 'data');--> statement-breakpoint
CREATE TYPE "public"."intelligence_classification" AS ENUM('individual', 'collective', 'multi');--> statement-breakpoint
CREATE TYPE "public"."intelligence_mode" AS ENUM('individual', 'collective');--> statement-breakpoint
CREATE TYPE "public"."intelligence_stance" AS ENUM('author', 'co_author', 'endorses', 'disputes');--> statement-breakpoint
CREATE TYPE "public"."intelligence_status" AS ENUM('draft', 'submitted', 'validated', 'rejected', 'retired');--> statement-breakpoint
CREATE TYPE "public"."intelligence_type" AS ENUM('principle', 'behavioral_rule', 'diagnostic_framework', 'decision_framework', 'scenario', 'conversation_example', 'case_study', 'benchmark', 'outcome', 'correction', 'lesson_learned', 'perspective');--> statement-breakpoint
CREATE TABLE "cro_intelligence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "intelligence_type" NOT NULL,
	"category" text,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"stages" text[] DEFAULT '{}'::text[] NOT NULL,
	"industries" text[] DEFAULT '{}'::text[] NOT NULL,
	"company_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"expertise" text[] DEFAULT '{}'::text[] NOT NULL,
	"primary_cro_id" uuid,
	"classification" "intelligence_classification" DEFAULT 'individual' NOT NULL,
	"source" text,
	"status" "intelligence_status" DEFAULT 'draft' NOT NULL,
	"evidence" "evidence_level" DEFAULT 'opinion' NOT NULL,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"related_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"modes" "intelligence_mode"[] DEFAULT '{individual,collective}'::intelligence_mode[] NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cro_intelligence_contributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"cro_id" uuid NOT NULL,
	"stance" "intelligence_stance" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cro_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"headline" text,
	"photo_url" text,
	"bio" text,
	"career_history" text,
	"accomplishments" text,
	"industries" text[] DEFAULT '{}'::text[] NOT NULL,
	"stages" text[] DEFAULT '{}'::text[] NOT NULL,
	"company_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"functions" text[] DEFAULT '{}'::text[] NOT NULL,
	"expertise" text[] DEFAULT '{}'::text[] NOT NULL,
	"website_url" text,
	"available_for_advisory" boolean DEFAULT false NOT NULL,
	"philosophy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "cro_profile_status" DEFAULT 'draft' NOT NULL,
	"in_collective" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "intelligence_ids" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "cro_id" uuid;--> statement-breakpoint
ALTER TABLE "cro_intelligence" ADD CONSTRAINT "cro_intelligence_primary_cro_id_cro_profiles_id_fk" FOREIGN KEY ("primary_cro_id") REFERENCES "public"."cro_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_intelligence" ADD CONSTRAINT "cro_intelligence_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_intelligence" ADD CONSTRAINT "cro_intelligence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_intelligence_contributors" ADD CONSTRAINT "cro_intelligence_contributors_record_id_cro_intelligence_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."cro_intelligence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_intelligence_contributors" ADD CONSTRAINT "cro_intelligence_contributors_cro_id_cro_profiles_id_fk" FOREIGN KEY ("cro_id") REFERENCES "public"."cro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_profiles" ADD CONSTRAINT "cro_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_profiles" ADD CONSTRAINT "cro_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cro_intelligence_cro_idx" ON "cro_intelligence" USING btree ("primary_cro_id");--> statement-breakpoint
CREATE INDEX "cro_intelligence_status_idx" ON "cro_intelligence" USING btree ("status","type");--> statement-breakpoint
CREATE UNIQUE INDEX "cro_intelligence_contributors_idx" ON "cro_intelligence_contributors" USING btree ("record_id","cro_id");--> statement-breakpoint
CREATE INDEX "cro_intelligence_contributors_cro_idx" ON "cro_intelligence_contributors" USING btree ("cro_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cro_profiles_slug_idx" ON "cro_profiles" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "cro_profiles_user_idx" ON "cro_profiles" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_cro_id_cro_profiles_id_fk" FOREIGN KEY ("cro_id") REFERENCES "public"."cro_profiles"("id") ON DELETE set null ON UPDATE no action;