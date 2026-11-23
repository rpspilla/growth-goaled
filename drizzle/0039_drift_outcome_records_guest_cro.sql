ALTER TABLE "commitments" ADD COLUMN "times_moved" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cro_intelligence" ADD COLUMN "from_commitment_id" uuid;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD COLUMN "cro_id" uuid;--> statement-breakpoint
ALTER TABLE "cro_intelligence" ADD CONSTRAINT "cro_intelligence_from_commitment_id_commitments_id_fk" FOREIGN KEY ("from_commitment_id") REFERENCES "public"."commitments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_cro_id_cro_profiles_id_fk" FOREIGN KEY ("cro_id") REFERENCES "public"."cro_profiles"("id") ON DELETE set null ON UPDATE no action;