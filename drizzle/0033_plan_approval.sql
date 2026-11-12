ALTER TABLE "deliverables" ADD COLUMN "plan_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "plan_approved_by" uuid;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_plan_approved_by_users_id_fk" FOREIGN KEY ("plan_approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Plans already live when the gate arrived stay live (an advisor has been working with them).
UPDATE "deliverables" SET "plan_approved_at" = now() WHERE "id" IN (SELECT DISTINCT "deliverable_id" FROM "plan_actions");
