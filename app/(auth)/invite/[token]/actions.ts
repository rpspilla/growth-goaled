"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { acceptInvite } from "@/lib/data/invites";

export type AcceptState = { error?: string };

export async function acceptInviteAction(token: string): Promise<AcceptState> {
  const user = await requireUser({ allowIncomplete: true });
  const result = await acceptInvite(user, token);
  if (!result.ok) return { error: result.error };
  // New founders finish their profile on /welcome; returning ones land on the dashboard.
  redirect("/");
}
