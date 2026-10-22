"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/invites";

/** Signs out, then goes to the form's `next` field if it's a same-site path (default /sign-in). */
export async function signOut(formData?: FormData) {
  await getAuth().signOut();
  const next = formData?.get("next");
  redirect(typeof next === "string" ? safeNextPath(next) : "/sign-in");
}
