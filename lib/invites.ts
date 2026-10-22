import { createHash, randomBytes } from "node:crypto";

export const INVITE_TTL_DAYS = 14;

/** A fresh single-use token. Only its hash is stored; the token itself goes in the emailed link. */
export function generateInviteToken(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type InviteStatus = "valid" | "expired" | "accepted";

export function inviteStatus(invite: { expiresAt: Date; acceptedAt: Date | null }, now = new Date()): InviteStatus {
  if (invite.acceptedAt) return "accepted";
  return invite.expiresAt.getTime() <= now.getTime() ? "expired" : "valid";
}

export const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Only same-site absolute paths may be used as a post-sign-in destination. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
