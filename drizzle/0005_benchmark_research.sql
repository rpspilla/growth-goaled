ALTER TYPE "public"."agent_kind" ADD VALUE 'research';--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "cohort_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "started_by" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_cohort_id_benchmark_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."benchmark_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;