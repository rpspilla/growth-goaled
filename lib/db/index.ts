import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | undefined;

function getDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    instance = drizzle(neon(url), { schema });
  }
  return instance;
}

/** Pooled Neon connection, created on first query so builds don't need database env. */
export const db: Db = new Proxy({} as Db, {
  get: (_target, prop) => Reflect.get(getDb(), prop),
});

export { schema };
