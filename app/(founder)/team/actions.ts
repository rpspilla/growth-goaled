"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { cancelTeammateInvite, inviteTeammate, removeTeammate, type TeamResult } from "@/lib/data/team";

/** The founder's own company, for the Team page actions. */
async function founderCompany() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  return company ? { user, company } : null;
}

export async function inviteTeammateAction(email: string): Promise<TeamResult> {
  const ctx = await founderCompany();
  if (!ctx) return { ok: false, error: "Set up your company first." };
  const r = await inviteTeammate(ctx.user, ctx.company.id, typeof email === "string" ? email : "");
  revalidatePath("/team");
  return r;
}

export async function cancelTeammateInviteAction(inviteId: string): Promise<TeamResult> {
  const ctx = await founderCompany();
  const id = z.uuid().safeParse(inviteId);
  if (!ctx || !id.success) return { ok: false, error: "Invite not found." };
  const r = await cancelTeammateInvite(ctx.user, ctx.company.id, id.data);
  revalidatePath("/team");
  return r;
}

export async function removeTeammateAction(userId: string): Promise<TeamResult> {
  const ctx = await founderCompany();
  const id = z.uuid().safeParse(userId);
  if (!ctx || !id.success) return { ok: false, error: "Person not found." };
  const r = await removeTeammate(ctx.user, ctx.company.id, id.data);
  revalidatePath("/team");
  return r;
}
