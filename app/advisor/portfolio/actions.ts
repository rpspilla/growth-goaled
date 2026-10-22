"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createInvite, inviteInput, resendInvite, revokeInvite, type InviteResult } from "@/lib/data/invites";

export type InviteFormState = { result?: InviteResult; email?: string };

export async function inviteFounder(_prev: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const user = await requireRole(["advisor", "admin"]);
  const parsed = inviteInput.safeParse({ email: formData.get("email"), companyName: formData.get("companyName") });
  if (!parsed.success) return { result: { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." } };
  const result = await createInvite(user, parsed.data);
  revalidatePath("/advisor/portfolio");
  return { result, email: parsed.data.email };
}

const idInput = z.object({ inviteId: z.uuid() });

export async function resendInviteAction(_prev: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const user = await requireRole(["advisor", "admin"]);
  const { inviteId } = idInput.parse({ inviteId: formData.get("inviteId") });
  const result = await resendInvite(user, inviteId);
  revalidatePath("/advisor/portfolio");
  return { result };
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const user = await requireRole(["advisor", "admin"]);
  const { inviteId } = idInput.parse({ inviteId: formData.get("inviteId") });
  await revokeInvite(user, inviteId);
  revalidatePath("/advisor", "layout");
}
