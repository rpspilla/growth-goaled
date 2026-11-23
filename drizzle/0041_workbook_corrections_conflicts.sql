CREATE TYPE "public"."intelligence_conflict_status" AS ENUM('suggested', 'confirmed', 'dismissed');--> statement-breakpoint
CREATE TABLE "cro_intelligence_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"other_id" uuid NOT NULL,
	"why" text NOT NULL,
	"status" "intelligence_conflict_status" DEFAULT 'suggested' NOT NULL,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cro_intelligence" ADD COLUMN "from_message_id" uuid;--> statement-breakpoint
ALTER TABLE "cro_intelligence" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "cro_intelligence_conflicts" ADD CONSTRAINT "cro_intelligence_conflicts_record_id_cro_intelligence_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."cro_intelligence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_intelligence_conflicts" ADD CONSTRAINT "cro_intelligence_conflicts_other_id_cro_intelligence_id_fk" FOREIGN KEY ("other_id") REFERENCES "public"."cro_intelligence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_intelligence_conflicts" ADD CONSTRAINT "cro_intelligence_conflicts_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cro_intelligence_conflicts_pair_idx" ON "cro_intelligence_conflicts" USING btree ("record_id","other_id");--> statement-breakpoint
ALTER TABLE "cro_intelligence" ADD CONSTRAINT "cro_intelligence_from_message_id_conversation_messages_id_fk" FOREIGN KEY ("from_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cro_intelligence_source_key_idx" ON "cro_intelligence" USING btree ("primary_cro_id","source_key");