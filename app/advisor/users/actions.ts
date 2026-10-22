"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";

const input = z.object({
  userId: z.uuid(),
  role: z.enum(schema.userRole.enumValues),
});

export async function setUserRole(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin"]);
  const { userId, role } = input.parse(Object.fromEntries(formData));
  // Admins can't change their own role, so there is always at least one admin.
  if (userId === admin.id) return;
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
  revalidatePath("/advisor/users");
}
