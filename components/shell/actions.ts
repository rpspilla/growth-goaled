"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/invites";
import { isUseCaseId } from "@/lib/use-cases";
import { USE_CASE_COOKIE } from "@/lib/use-cases/cookie";

/** Signs out, then goes to the form's `next` field if it's a same-site path (default /sign-in). */
export async function signOut(formData?: FormData) {
  await getAuth().signOut();
  const next = formData?.get("next");
  redirect(typeof next === "string" ? safeNextPath(next) : "/sign-in");
}

/** Use case switcher at the top of the sidebar. */
export async function selectUseCase(formData: FormData) {
  const id = formData.get("useCase");
  if (typeof id !== "string" || !isUseCaseId(id)) return;
  (await cookies()).set(USE_CASE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
