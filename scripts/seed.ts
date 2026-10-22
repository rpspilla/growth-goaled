// Seeds the Acme AI sample company (every environment) and, with --portfolio,
// the fake advisory portfolio (never production). Idempotent: seed rows have
// fixed ids and are replaced on each run.
//
//   npm run db:seed                 # Acme AI + portfolio (local / staging)
//   npm run db:seed -- --sample-only
//   tsx scripts/seed.ts --auto      # build step: picks by VERCEL_ENV
import "dotenv/config";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { inArray } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { acme, ACME_ID, benchmark, portfolio, PORTFOLIO_IDS, rubric, SAMPLE_IDS, SEED_USERS, users } from "../lib/seed/data";

const args = new Set(process.argv.slice(2));
const isProduction = process.env.VERCEL_ENV === "production" || process.env.APP_URL?.includes("app.growthgoaled.com");

let withPortfolio: boolean;
if (args.has("--auto")) {
  if (!process.env.VERCEL) {
    console.log("[seed] Not on Vercel; skipping automatic seed (run npm run db:seed).");
    process.exit(0);
  }
  withPortfolio = process.env.VERCEL_ENV === "preview";
} else {
  withPortfolio = !args.has("--sample-only");
}
if (withPortfolio && isProduction) {
  console.error("[seed] Refusing to seed the fake portfolio into production.");
  process.exit(1);
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("[seed] DATABASE_URL_UNPOOLED or DATABASE_URL must be set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });

try {
  await db.transaction(async (tx) => {
    const a = acme();
    const b = benchmark();
    const p = portfolio();

    // Remove previous seed rows; children cascade from companies/cohort/rubric.
    await tx.delete(schema.companies).where(inArray(schema.companies.id, [ACME_ID, ...PORTFOLIO_IDS]));
    await tx.delete(schema.benchmarkCohorts).where(inArray(schema.benchmarkCohorts.id, [SAMPLE_IDS.cohort]));
    await tx.delete(schema.benchmarkSources).where(inArray(schema.benchmarkSources.id, [SAMPLE_IDS.source]));
    await tx.delete(schema.scoreRubrics).where(inArray(schema.scoreRubrics.id, [SAMPLE_IDS.rubric]));
    await tx.delete(schema.users).where(inArray(schema.users.id, Object.values(SEED_USERS)));

    await tx.insert(schema.users).values(users());
    await tx.insert(schema.benchmarkSources).values(b.source);
    await tx.insert(schema.benchmarkCohorts).values(b.cohort);
    await tx.insert(schema.benchmarkMetrics).values(b.metrics);
    await tx.insert(schema.scoreRubrics).values(rubric());

    await tx.insert(schema.companies).values(a.company);
    await tx.insert(schema.companyMembers).values(a.member);
    await tx.insert(schema.dataPoints).values(a.dataPoints);
    await tx.insert(schema.registerItems).values(a.registerItems);
    await tx.insert(schema.companyScores).values(a.score);
    await tx.insert(schema.deliverables).values(a.deliverable);
    await tx.insert(schema.claims).values(a.claims);
    await tx.insert(schema.claimSources).values(a.claimSources);
    await tx.insert(schema.reviews).values(a.review);

    if (withPortfolio) {
      await tx.insert(schema.companies).values(p.companies);
      await tx.insert(schema.dataPoints).values(p.dataPoints);
      await tx.insert(schema.companyScores).values(p.scores);
    }
  });
  console.log(`[seed] Seeded Acme AI sample${withPortfolio ? " and fake portfolio" : ""}.`);
} catch (err) {
  console.error("[seed] Failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
