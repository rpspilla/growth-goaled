"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { track } from "@/lib/events";

const SIGNUP_EVENTS = ["signup_started", "signup_submitted", "signup_link_sent", "signup_failed"] as const;
const REASONS = ["invalid_email", "rate_limited", "auth_error", "network"] as const;

/**
 * Sign-up funnel events from the browser. Deliberately public (visitors aren't signed in yet), so it
 * accepts only fixed event names and failure categories: no email, name or free text is ever stored.
 */
export async function trackSignupEvent(name: string, reason?: string): Promise<void> {
  const event = z.enum(SIGNUP_EVENTS).safeParse(name);
  if (!event.success) return;
  const why = z.enum(REASONS).safeParse(reason);
  const user = await getCurrentUser().catch(() => null);
  await track(event.data, { userId: user?.id, props: why.success ? { reason: why.data } : undefined });
}
