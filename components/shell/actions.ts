"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";

export async function signOut() {
  await getAuth().signOut();
  redirect("/sign-in");
}
