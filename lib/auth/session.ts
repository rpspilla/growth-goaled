import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth } from "@/lib/auth/server";
import { homePathFor } from "@/lib/access";
import { needsOnboarding } from "@/lib/onboarding";
import type { Role, User } from "@/lib/db/schema";
import { cookies } from "next/headers";
import { E2E_COOKIE, e2eEnabled } from "@/lib/e2e";

async function e2eAuthUser(): Promise<{ id: string; email: string; name: string } | null> {
  const email = (await cookies()).get(E2E_COOKIE)?.value;
  return email && /^[^@\s]+@[^@\s]+$/.test(email) ? { id: `e2e:${email}`, email, name: "" } : null;
}

/**
 * The signed-in user's row in our `users` table, created on first sign-in.
 * New users are founders; roles are changed by an admin (or `npm run user:role`).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  await connection(); // per-request: never prerender signed-in pages
  const authUser = e2eEnabled() ? await e2eAuthUser() : (await getAuth().getSession()).data?.user;
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

/**
 * Signed-in user, or a redirect to /sign-in. Users who have not finished the
 * first-sign-in form are sent to /welcome unless `allowIncomplete` is set.
 */
export async function requireUser({ allowIncomplete = false } = {}): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!allowIncomplete && needsOnboarding(user)) redirect("/welcome");
  return user;
}

/** Redirects users without one of `roles` to their own home. */
export async function requireRole(roles: readonly Role[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homePathFor(user.role));
  return user;
}
