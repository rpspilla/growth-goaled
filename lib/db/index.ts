import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | undefined;

/** A local Postgres (end-to-end tests, offline dev) is reached over TCP instead of Neon's HTTP driver. */
export const isLocalDatabase = (url: string) => /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url);

function getDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    if (isLocalDatabase(url)) {
      const local = drizzlePg(new Pool({ connectionString: url, max: 5 }), { schema });
      // `batch` is Neon-HTTP only (atomic there). Locally the queries run in order, which is enough for tests.
      const batch = async (queries: PromiseLike<unknown>[]) => {
        const out: unknown[] = [];
        for (const q of queries) out.push(await q);
        return out;
      };
      instance = Object.assign(local, { batch }) as unknown as Db;
    } else {
      instance = drizzle(neon(url), { schema });
    }
  }
  return instance;
}

/** Pooled Neon connection, created on first query so builds don't need database env. */
export const db: Db = new Proxy({} as Db, {
  get: (_target, prop) => Reflect.get(getDb(), prop),
});

export { schema };
