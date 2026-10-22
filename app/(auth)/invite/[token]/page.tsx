import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { getInviteByToken } from "@/lib/data/invites";
import { sameEmail } from "@/lib/invites";
import { signOut } from "@/components/shell/actions";
import { AuthCard } from "../../AuthCard";
import { MagicLinkForm } from "../../MagicLinkForm";
import { AcceptButton } from "./AcceptButton";

export const metadata: Metadata = { title: "Your invite · Growth Goaled" };

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <AuthCard title={title} subtitle={body}>
      <Link
        href="/sign-in"
        className="block w-full py-3 rounded-lg font-semibold text-sm text-center"
        style={{ background: "var(--green)", color: "#fff" }}
      >
        Go to sign in
      </Link>
    </AuthCard>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, user] = await Promise.all([getInviteByToken(token), getCurrentUser()]);

  if (!invite) return <Problem title="Invite not found." body="This link isn't valid. Check you copied the whole link from your email." />;
  if (invite.status === "accepted") return <Problem title="Invite already used." body="Sign in with your email to continue." />;
  if (invite.status === "expired") {
    return <Problem title="This invite has expired." body="Invites last 14 days. Ask your advisor to resend it." />;
  }

  const inviter = invite.inviterName ?? "Your advisor";
  const subtitle = `${inviter} has set up ${invite.companyName} on Growth Goaled.`;
  const here = `/invite/${token}`;

  if (!user) {
    return (
      <AuthCard title={<>You&apos;re <em>invited.</em></>} subtitle={`${subtitle} We'll email ${invite.email} a secure sign-in link.`}>
        <MagicLinkForm mode="sign-in" lockedEmail={invite.email} next={here} />
      </AuthCard>
    );
  }

  if (!sameEmail(user.email, invite.email)) {
    return (
      <AuthCard title="Wrong account." subtitle={`This invite is for ${invite.email}, but you're signed in as ${user.email}.`}>
        <form action={signOut}>
          <input type="hidden" name="next" value={here} />
          <button
            type="submit"
            className="w-full py-3 rounded-lg font-semibold text-sm"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            Sign out and continue
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={<>Welcome to <em>{invite.companyName}.</em></>} subtitle={subtitle}>
      <AcceptButton token={token} companyName={invite.companyName} />
    </AuthCard>
  );
}
