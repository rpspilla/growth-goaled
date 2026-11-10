import "server-only";
import { and, asc, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { canViewCompany } from "@/lib/access";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { sendEmail, teammateInviteEmail } from "@/lib/email";
import { track } from "@/lib/events";
import { generateInviteToken, INVITE_TTL_DAYS, inviteStatus } from "@/lib/invites";
import { canAddCompanies } from "@/lib/multi-company";

/**
 * Several people on one company: a founder (or the company's advisor) invites teammates by email;
 * they join as members and see everything the company has. Owners and staff can remove people.
 */
export type TeamResult = { ok: true; link?: string; emailed?: boolean; emailNote?: string } | { ok: false; error: string };
export const teammateEmail = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));

const appOrigin = () => (process.env.APP_URL ? new URL(process.env.APP_URL).origin : "http://localhost:3000");

/** Who may manage a company's people: its own founders (any member), or staff who can see the company. */
async function access(actor: User, companyId: string) {
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
  if (!company) return null;
  if (actor.role === "founder") {
    const [m] = await db.select().from(schema.companyMembers).where(and(eq(schema.companyMembers.companyId, companyId), eq(schema.companyMembers.userId, actor.id))).limit(1);
    return m ? { company, owner: m.memberRole === "owner", staff: false } : null;
  }
  return canViewCompany(actor, company, []) ? { company, owner: true, staff: true } : null;
}

/** Everyone with access, and invites not yet accepted. */
export async function companyPeople(companyId: string) {
  const [members, invites] = await Promise.all([
    db
      .select({ userId: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.companyMembers.memberRole, since: schema.companyMembers.createdAt })
      .from(schema.companyMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
      .where(eq(schema.companyMembers.companyId, companyId))
      .orderBy(asc(schema.companyMembers.createdAt)),
    db.select().from(schema.invites).where(and(eq(schema.invites.companyId, companyId), isNull(schema.invites.acceptedAt))).orderBy(desc(schema.invites.createdAt)),
  ]);
  return { members, invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.memberRole, expired: inviteStatus(i) !== "valid", createdAt: i.createdAt })) };
}

/** Invites a teammate into an existing company; returns the single-use link (shown once) and whether it was emailed. */
export async function inviteTeammate(actor: User, companyId: string, rawEmail: string): Promise<TeamResult> {
  const parsed = teammateEmail.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  const email = parsed.data;
  const a = await access(actor, companyId);
  if (!a) return { ok: false, error: "Company not found." };

  const [existing] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  if (existing) {
    if (existing.role !== "founder") return { ok: false, error: "That email belongs to an advisor or admin account; they already see the companies they work with." };
    const memberships = await db.select().from(schema.companyMembers).where(eq(schema.companyMembers.userId, existing.id));
    if (memberships.some((m) => m.companyId === companyId)) return { ok: false, error: "They already have access." };
    if (memberships.length > 0 && !canAddCompanies(existing.email)) return { ok: false, error: "That person already belongs to another company on Growth Goaled." };
  }
  const [pending] = await db
    .select({ n: count() })
    .from(schema.invites)
    .where(and(eq(schema.invites.companyId, companyId), sql`lower(${schema.invites.email}) = ${email}`, isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date())));
  if ((pending?.n ?? 0) > 0) return { ok: false, error: "They already have a pending invite. Cancel it to send a new one." };

  const { token, hash, expiresAt } = generateInviteToken();
  await db.insert(schema.invites).values({ email, companyId, invitedBy: actor.id, tokenHash: hash, expiresAt, memberRole: "member" });
  const link = `${appOrigin()}/invite/${token}`;
  const sent = await sendEmail({ to: email, ...teammateInviteEmail({ inviterName: actor.name || actor.email, companyName: a.company.name, link, expiresInDays: INVITE_TTL_DAYS }) }).catch((err) => ({ sent: false as const, reason: String(err) }));
  await track("teammate_invited", { userId: actor.id, companyId, props: { emailed: sent.sent } });
  return { ok: true, link, emailed: sent.sent, ...(sent.sent ? {} : { emailNote: sent.reason }) };
}

/** Cancels an invite that hasn't been used. */
export async function cancelTeammateInvite(actor: User, companyId: string, inviteId: string): Promise<TeamResult> {
  if (!(await access(actor, companyId))) return { ok: false, error: "Company not found." };
  const gone = await db.delete(schema.invites).where(and(eq(schema.invites.id, inviteId), eq(schema.invites.companyId, companyId), isNull(schema.invites.acceptedAt))).returning({ id: schema.invites.id });
  return gone.length ? { ok: true } : { ok: false, error: "That invite was already used or cancelled." };
}

/** Removes someone's access (owners and staff only). The last owner stays, and founders can't remove themselves. */
export async function removeTeammate(actor: User, companyId: string, userId: string): Promise<TeamResult> {
  const a = await access(actor, companyId);
  if (!a) return { ok: false, error: "Company not found." };
  if (!a.owner) return { ok: false, error: "Only an owner can remove people." };
  if (userId === actor.id) return { ok: false, error: "You can't remove yourself." };
  const members = await db.select().from(schema.companyMembers).where(eq(schema.companyMembers.companyId, companyId));
  const target = members.find((m) => m.userId === userId);
  if (!target) return { ok: false, error: "They don't have access." };
  if (target.memberRole === "owner" && members.filter((m) => m.memberRole === "owner").length === 1) return { ok: false, error: "A company needs at least one owner." };
  await db.delete(schema.companyMembers).where(and(eq(schema.companyMembers.companyId, companyId), eq(schema.companyMembers.userId, userId)));
  await track("teammate_removed", { userId: actor.id, companyId, props: {} });
  return { ok: true };
}
