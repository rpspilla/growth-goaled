import { cookies } from "next/headers";
import { GuestChat } from "@/components/chat/GuestChat";
import { GUEST_COOKIE, guestByToken, guestView } from "@/lib/data/guest";
import { guestCroAction, guestEmailAction, guestReplyAction, guestRestartAction } from "./guest-actions";
import { ReturningSignIn } from "./ReturningSignIn";
import { isBeta } from "@/lib/beta";

/** The way in for founders: a conversation first, an email only once there's a recommendation to unlock. */
export async function GuestEntry({ cro, signIn = false }: { cro?: string; signIn?: boolean } = {}) {
  const g = await guestByToken((await cookies()).get(GUEST_COOKIE)?.value);
  const view = await guestView(g && !g.claimedAt ? g : null);
  // From a public CRO page: that CRO's AI, chosen for them (if the chat hasn't started with someone else).
  const preferred = cro ? view.cros.find((c) => c.slug === cro) : undefined;
  return (
    <div className="space-y-8">
      <GuestChat view={view} reply={guestReplyAction} giveEmail={guestEmailAction} restart={guestRestartAction} chooseCro={guestCroAction} preferredCroId={preferred?.id ?? null} beta={isBeta()} />
      {signIn && <ReturningSignIn />}
    </div>
  );
}
