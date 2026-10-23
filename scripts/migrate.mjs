// Applies committed migrations in ./drizzle. Runs as the first step of `npm run build`
// so each Vercel environment migrates its own Neon branch (direct, unpooled URL).
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

const url = process.env.DATABASE_URL_UNPOOLED;

if (!url) {
  if (process.env.VERCEL) {
    console.error("[migrate] DATABASE_URL_UNPOOLED is not set for this Vercel environment.");
    process.exit(1);
  }
  console.log("[migrate] DATABASE_URL_UNPOOLED not set; skipping migrations (local build).");
  process.exit(0);
}

// A local Postgres (end-to-end tests) is reached over TCP with node-postgres.
const local = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url);
const pool = local ? new (await import("pg")).default.Pool({ connectionString: url }) : new Pool({ connectionString: url });
try {
  const host = new URL(url).hostname;
  console.log(`[migrate] Applying migrations to ${host}…`);
  if (local) {
    const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");
    const { migrate: migratePg } = await import("drizzle-orm/node-postgres/migrator");
    await migratePg(drizzlePg(pool), { migrationsFolder: "./drizzle" });
  } else {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  }
  console.log("[migrate] Done.");
} catch (err) {
  console.error("[migrate] Failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
