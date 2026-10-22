CREATE TYPE "public"."revenue_band" AS ENUM('lt_1m', '1m_3m', '3m_10m', '10m_20m', '20m_50m');--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "revenue_band" "revenue_band";