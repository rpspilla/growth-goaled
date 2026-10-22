import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { generateInviteToken, hashInviteToken, INVITE_TTL_DAYS, inviteStatus, sameEmail } from "@/lib/invites";
import { inviteEmail, sendEmail } from "@/lib/email";
import { track } from "@/lib/events";
import { getFounderCompany } from "./companies";

export type InviteResult =
  | { ok: true; link: string; emailed: boolean; emailNote?: string }
  | { ok: false; error: string };

export const inviteInput = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  companyName: z.string().trim().min(1, "Enter the company name.").max(160),
});

function appOrigin(): string {
  return process.env.APP_URL ? new URL(process.env.APP_URL).origin : "http://localhost:3000";
}

const inviteLink = (token: string) => `${appOrigin()}/invite/${token}`;

/** Advisors manage invites for their own companies; admins for all. */
function companyScope(actor: User) {
  return actor.role === "admin" ? undefined : eq(schema.companies.advisorId, actor.id);
}

async function deliver(actor: User, email: string, companyName: string, token: string) {
  const link = inviteLink(token);
  const msg = inviteEmail({ advisorName: actor.name ?? "Your advisor", companyName, link, expiresInDays: INVITE_TTL_DAYS });
  const sent = await sendEmail({ to: email, ...msg });
  return sent.sent ? { link, emailed: true } : { link, emailed: false, emailNote: sent.reason };
}

/** Creates the company (assigned to the inviting advisor) and a single-use invite for its founder. */
export async function createInvite(actor: User, input: z.infer<typeof inviteInput>): Promise<InviteResult> {
  const { email, companyName } = input;

  const [existingUser] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`)
    .limit(1);
  if (existingUser && existingUser.role !== "founder") {
    return { ok: false, error: "That email belongs to an advisor or admin account." };
  }
  if (existingUser && (await getFounderCompany(existingUser))) {
    return { ok: false, error: "That founder already has a company on Growth Goaled." };
  }

  const [pending] = await db
    .select({ n: count() })
    .from(schema.invites)
    .where(and(sql`lower(${schema.invites.email}) = ${email}`, isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date())));
  if ((pending?.n ?? 0) > 0) return { ok: false, error: "There's already a pending invite for that email. Resend it instead." };

  const companyId = randomUUID();
  const { token, hash, expiresAt } = generateInviteToken();
  await db.batch([
    // Invited companies start assigned to whoever sent the invite.
    db.insert(schema.companies).values({ id: companyId, name: companyName, advisorId: actor.id }),
    db.insert(schema.invites).values({ email, companyId, invitedBy: actor.id, tokenHash: hash, expiresAt }),
  ]);

  const delivery = await deliver(actor, email, companyName, token);
  await track("invite_sent", { userId: actor.id, companyId, props: { emailed: delivery.emailed } });
  return { ok: true, ...delivery };
}

export type InviteRow = {
  id: string;
  email: string;
  companyName: string;
  status: "valid" | "expired";
  expiresAt: Date;
  createdAt: Date;
};

/** Unaccepted invites for companies the actor manages. */
export async function listOpenInvites(actor: User): Promise<InviteRow[]> {
  const rows = await db
    .select({ invite: schema.invites, companyName: schema.companies.name })
    .from(schema.invites)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.invites.companyId))
    .where(and(isNull(schema.invites.acceptedAt), companyScope(actor)))
    .orderBy(desc(schema.invites.createdAt));
  return rows.map(({ invite, companyName }) => ({
    id: invite.id,
    email: invite.email,
    companyName,
    status: inviteStatus(invite) === "valid" ? "valid" : "expired",
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  }));
}

async function findManagedInvite(actor: User, inviteId: string) {
  const [row] = await db
    .select({ invite: schema.invites, company: schema.companies })
    .from(schema.invites)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.invites.companyId))
    .where(and(eq(schema.invites.id, inviteId), isNull(schema.invites.acceptedAt), companyScope(actor)))
    .limit(1);
  return row ?? null;
}

/** Issues a new token (the old link stops working) and re-sends it. */
export async function resendInvite(actor: User, inviteId: string): Promise<InviteResult> {
  const row = await findManagedInvite(actor, inviteId);
  if (!row) return { ok: false, error: "Invite not found." };
  const { token, hash, expiresAt } = generateInviteToken();
  await db.update(schema.invites).set({ tokenHash: hash, expiresAt }).where(eq(schema.invites.id, inviteId));
  const delivery = await deliver(actor, row.invite.email, row.company.name, token);
  await track("invite_sent", { userId: actor.id, companyId: row.company.id, props: { emailed: delivery.emailed, resend: true } });
  return { ok: true, ...delivery };
}

/** Cancels an invite. The company it created is removed too if nobody ever joined it. */
export async function revokeInvite(actor: User, inviteId: string): Promise<void> {
  const row = await findManagedInvite(actor, inviteId);
  if (!row) return;
  const [members] = await db
    .select({ n: count() })
    .from(schema.companyMembers)
    .where(eq(schema.companyMembers.companyId, row.company.id));
  if ((members?.n ?? 0) === 0) await db.delete(schema.companies).where(eq(schema.companies.id, row.company.id));
  else await db.delete(schema.invites).where(eq(schema.invites.id, inviteId));
}

/** Public view of an invite by its token (for /invite/[token]). */
export async function getInviteByToken(token: string) {
  const [row] = await db
    .select({ invite: schema.invites, company: schema.companies, inviter: schema.users })
    .from(schema.invites)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.invites.companyId))
    .leftJoin(schema.users, eq(schema.users.id, schema.invites.invitedBy))
    .where(eq(schema.invites.tokenHash, hashInviteToken(token)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.invite.id,
    email: row.invite.email,
    companyId: row.company.id,
    companyName: row.company.name,
    inviterName: row.inviter?.name ?? null,
    status: inviteStatus(row.invite),
  };
}

export type AcceptResult = { ok: true } | { ok: false; error: string };

/** Attaches the signed-in founder to the invited company. The account email must match the invite. */
export async function acceptInvite(user: User, token: string): Promise<AcceptResult> {
  const invite = await getInviteByToken(token);
  if (!invite) return { ok: false, error: "This invite link isn't valid." };
  if (invite.status === "accepted") return { ok: false, error: "This invite has already been used." };
  if (invite.status === "expired") return { ok: false, error: "This invite has expired. Ask your advisor to resend it." };
  if (!sameEmail(user.email, invite.email)) {
    return { ok: false, error: `This invite is for ${invite.email}. Sign out and sign in with that address.` };
  }
  if (user.role !== "founder") return { ok: false, error: "Invites are for founder accounts." };
  const existing = await getFounderCompany(user);
  if (existing && existing.id !== invite.companyId) {
    return { ok: false, error: `Your account already belongs to ${existing.name}.` };
  }

  // Claim the invite atomically so a token can only ever be used once.
  const claimed = await db
    .update(schema.invites)
    .set({ acceptedAt: new Date() })
    .where(and(eq(schema.invites.id, invite.id), isNull(schema.invites.acceptedAt)))
    .returning({ id: schema.invites.id });
  if (claimed.length === 0) return { ok: false, error: "This invite has already been used." };

  if (!existing) {
    await db
      .insert(schema.companyMembers)
      .values({ companyId: invite.companyId, userId: user.id, memberRole: "owner" })
      .onConflictDoNothing();
  }
  await track("invite_accepted", { userId: user.id, companyId: invite.companyId });
  return { ok: true };
}
