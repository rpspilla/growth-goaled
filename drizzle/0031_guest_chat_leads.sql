ALTER TABLE "guest_sessions" ADD COLUMN "questions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD COLUMN "crm_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_crm_contact_id_crm_contacts_id_fk" FOREIGN KEY ("crm_contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_sessions_contact_idx" ON "guest_sessions" USING btree ("crm_contact_id");--> statement-breakpoint
-- Chats from before the cap was counted: every AI answer was one question.
UPDATE "guest_sessions" SET "questions" = "ai_turns";
