import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth } from "@/lib/auth/server";
import { homePathFor } from "@/lib/access";
import type { Role, User } from "@/lib/db/schema";

/**
 * The signed-in user's row in our `users` table, created on first sign-in.
 * New users are founders; roles are changed by an admin (or `npm run user:role`).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  await connection(); // per-request: never prerender signed-in pages
  const { data: session } = await getAuth().getSession();
  const authUser = session?.user;
  if (!authUser) return null;

  const [user] = await db
    .insert(schema.users)
    .values({ authUserId: authUser.id, email: authUser.email, name: authUser.name || null })
    .onConflictDoUpdate({
      target: schema.users.authUserId,
      set: { email: authUser.email, name: sql`coalesce(${schema.users.name}, excluded.name)` },
    })
    .returning();
  return user ?? null;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Redirects users without one of `roles` to their own home. */
export async function requireRole(roles: readonly Role[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homePathFor(user.role));
  return user;
}
