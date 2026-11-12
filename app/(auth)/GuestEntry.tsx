import { cookies } from "next/headers";
import { GuestChat } from "@/components/chat/GuestChat";
import { GUEST_COOKIE, guestByToken, guestView } from "@/lib/data/guest";
import { guestEmailAction, guestReplyAction, guestRestartAction } from "./guest-actions";
import { ReturningSignIn } from "./ReturningSignIn";

/** The way in for founders: a conversation first, an email only once there's a recommendation to unlock. */
export async function GuestEntry() {
  const g = await guestByToken((await cookies()).get(GUEST_COOKIE)?.value);
  const view = await guestView(g && !g.claimedAt ? g : null);
  return (
    <div className="space-y-8">
      <GuestChat view={view} reply={guestReplyAction} giveEmail={guestEmailAction} restart={guestRestartAction} />
      <ReturningSignIn />
    </div>
  );
}
