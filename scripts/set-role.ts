// Usage: npm run user:role -- <email> <founder|advisor|admin>
// The user must have signed in once so their row exists.
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { users, userRole } from "../lib/db/schema";

const [email, role] = process.argv.slice(2);
const roles = userRole.enumValues;

if (!email || !role || !(roles as readonly string[]).includes(role)) {
  console.error(`Usage: npm run user:role -- <email> <${roles.join("|")}>`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (put it in .env.local or the environment).");
  process.exit(1);
}

const db = drizzle(neon(process.env.DATABASE_URL));
const updated = await db
  .update(users)
  .set({ role: role as (typeof roles)[number] })
  .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
  .returning({ email: users.email, role: users.role });

if (updated.length === 0) {
  console.error(`No user with email ${email}. They need to sign in once first.`);
  process.exit(1);
}
console.log(`${updated[0]!.email} is now ${updated[0]!.role}.`);
