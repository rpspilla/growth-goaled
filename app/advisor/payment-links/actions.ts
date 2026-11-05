"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { cancelPaymentLink, createPaymentLink } from "@/lib/data/payment-links";
import { paymentLinkInput } from "@/lib/payment-links";

export type PaymentLinkFormState = { ok: boolean; error?: string; url?: string; emailed?: boolean | null; emailError?: string } | null;

const appUrl = async () => {
  const h = await headers();
  return process.env.APP_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
};

/** An advisor creates a custom-project payment link (and optionally emails it to the client). */
export async function createPaymentLinkAction(_prev: PaymentLinkFormState, fd: FormData): Promise<PaymentLinkFormState> {
  const user = await requireRole(["advisor", "admin"]);
  const parsed = paymentLinkInput.safeParse({
    title: fd.get("title") ?? "",
    description: fd.get("description") ?? "",
    amount: fd.get("amount") ?? "",
    clientName: fd.get("clientName") ?? "",
    clientEmail: fd.get("clientEmail") ?? "",
    companyId: fd.get("companyId") ?? "",
    sendEmail: fd.get("sendEmail") === "on",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const r = await createPaymentLink(user, parsed.data, await appUrl());
  if (!r.ok) return r;
  revalidatePath("/advisor/payment-links");
  return { ok: true, url: r.url, emailed: r.emailed, emailError: r.emailError };
}

export async function cancelPaymentLinkAction(id: string) {
  const user = await requireRole(["advisor", "admin"]);
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Link not found." };
  const r = await cancelPaymentLink(user, parsed.data);
  revalidatePath("/advisor/payment-links");
  return r;
}
