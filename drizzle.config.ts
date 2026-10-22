import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Migrations use the direct (unpooled) connection.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Neon Auth owns the `neon_auth` schema; never let drizzle-kit touch it.
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
