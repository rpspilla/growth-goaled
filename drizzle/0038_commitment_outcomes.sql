CREATE TYPE "public"."commitment_outcome" AS ENUM('worked', 'partly', 'didnt');--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "outcome" "commitment_outcome";--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "outcome_note" text;