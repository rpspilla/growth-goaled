"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GUEST_COOKIE, guestByToken, guestEmail, guestReply, newToken, startGuest, type GuestResult } from "@/lib/data/guest";

const COOKIE = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 };

/**
 * The visitor's own guest chat, from an unguessable token in an httpOnly cookie. Guest actions are
 * public by design (no account yet) and can only ever read or change this one chat.
 */
async function guestSession(create = false) {
  const jar = await cookies();
  const existing = await guestByToken(jar.get(GUEST_COOKIE)?.value);
  if (existing || !create) return existing;
  const token = newToken();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const started = await startGuest(token, ip);
  if ("error" in started) return started;
  jar.set(GUEST_COOKIE, token, COOKIE);
  return started;
}

/** The visitor's next message: a sign-up answer while those are asked, then the conversation with the AI. */
export async function guestReplyAction(text: string): Promise<GuestResult> {
  const g = await guestSession(true);
  if (!g) return { ok: false, error: "Something went wrong. Please refresh and try again." };
  if ("error" in g) return { ok: false, error: g.error };
  const t = z.string().max(4000).safeParse(text);
  if (!t.success) return { ok: false, error: "Please keep it under 2,000 characters." };
  const result = await guestReply(g, t.data);
  revalidatePath("/sign-in");
  return result;
}

/** The email that unlocks the recommendation. The browser then sends the sign-in link that saves it. */
export async function guestEmailAction(email: string): Promise<GuestResult> {
  const g = await guestSession();
  if (!g || "error" in g) return { ok: false, error: "Your conversation expired. Please start again." };
  const parsed = z.email().safeParse(String(email).trim().toLowerCase());
  if (!parsed.success) return { ok: false, error: "Enter a valid email address, like you@company.com." };
  const result = await guestEmail(g, parsed.data);
  revalidatePath("/sign-in");
  return result;
}

/** Start over with a fresh conversation. */
export async function guestRestartAction(): Promise<void> {
  await guestSession();
  (await cookies()).delete(GUEST_COOKIE);
  revalidatePath("/sign-in");
}
