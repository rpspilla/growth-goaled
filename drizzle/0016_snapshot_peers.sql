ALTER TABLE "benchmark_records" ADD COLUMN "founded_from" integer;--> statement-breakpoint
ALTER TABLE "benchmark_records" ADD COLUMN "founded_to" integer;--> statement-breakpoint
ALTER TABLE "benchmark_sources" ADD COLUMN "snapshot_source" boolean DEFAULT false NOT NULL;