CREATE TYPE "public"."eval_run_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "eval_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"scenario_id" uuid NOT NULL,
	"answer" jsonb,
	"scores" jsonb,
	"notes" jsonb,
	"summary" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cro_id" uuid,
	"scenario_ids" jsonb NOT NULL,
	"status" "eval_run_status" DEFAULT 'running' NOT NULL,
	"averages" jsonb,
	"methodology_version" text NOT NULL,
	"created_by" uuid,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"category" text,
	"stage" text,
	"situation" text NOT NULL,
	"question" text NOT NULL,
	"source" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_scenario_id_eval_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."eval_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_cro_id_cro_profiles_id_fk" FOREIGN KEY ("cro_id") REFERENCES "public"."cro_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_results_run_scenario_idx" ON "eval_results" USING btree ("run_id","scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_scenarios_key_idx" ON "eval_scenarios" USING btree ("key");