"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getAuth } from "@/lib/auth/server";

export type MagicLinkState = { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string };

const input = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  name: z.string().trim().max(120).optional(),
});

/** Origin the magic link returns to. Must be listed in Neon Auth's trusted domains. */
async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function sendMagicLink(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const parsed = input.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  }

  const { email, name } = parsed.data;
  const { error } = await getAuth().signIn.magicLink({
    email,
    name,
    callbackURL: `${await appOrigin()}/`,
  });
  if (error) {
    return { status: "error", message: error.message || "We couldn't send your sign-in link. Try again." };
  }
  return { status: "sent", email };
}
