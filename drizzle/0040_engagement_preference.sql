ALTER TABLE "companies" ADD COLUMN "default_cro_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "cro_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "second_opinion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_default_cro_id_cro_profiles_id_fk" FOREIGN KEY ("default_cro_id") REFERENCES "public"."cro_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_cro_id_cro_profiles_id_fk" FOREIGN KEY ("cro_id") REFERENCES "public"."cro_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Existing answers came from their conversation's perspective.
UPDATE "conversation_messages" m SET "cro_id" = c."cro_id" FROM "conversations" c WHERE m."conversation_id" = c."id" AND m."role" = 'assistant' AND c."cro_id" IS NOT NULL;
