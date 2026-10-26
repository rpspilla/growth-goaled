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

/** Unique violation on users_email_idx, wherever the driver nests it. */
function isEmailTaken(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const x = e as { code?: string; constraint?: string; message?: string };
    if (x.code === "23505" && (x.constraint === "users_email_idx" || x.message?.includes("users_email_idx"))) return true;
  }
  return false;
}

/**
 * The signed-in user's row in our `users` table, created on first sign-in.
 * New users are founders; roles are changed by an admin (or `npm run user:role`).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  await connection(); // per-request: never prerender signed-in pages
  const authUser = e2eEnabled() ? await e2eAuthUser() : (await getAuth().getSession()).data?.user;
  if (!authUser) return null;

  let user: User | undefined;
  try {
    [user] = await db
      .insert(schema.users)
      .values({ authUserId: authUser.id, email: authUser.email, name: authUser.name || null })
      .onConflictDoUpdate({
        target: schema.users.authUserId,
        set: { email: authUser.email, name: sql`coalesce(${schema.users.name}, excluded.name)` },
      })
      .returning();
  } catch (err) {
    if (!isEmailTaken(err)) throw err;
    // The email already has a row under an earlier auth account (e.g. that account was deleted and
    // they signed up again). Auth verified this email, so the new account takes the row over.
    [user] = await db
      .update(schema.users)
      .set({ authUserId: authUser.id, updatedAt: new Date() })
      .where(sql`lower(${schema.users.email}) = lower(${authUser.email})`)
      .returning();
  }
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
