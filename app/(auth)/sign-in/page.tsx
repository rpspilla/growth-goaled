import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/invites";
import { AuthShell, Positioning } from "../AuthShell";
import { RallyLanding } from "../RallyLanding";
import { ReturningSignIn } from "../ReturningSignIn";

export const metadata: Metadata = { title: "Rally · Your CRO. Ready when you are.", description: "Expert CRO judgment for the decisions that drive your growth. Free during Beta. By Growth Goaled." };
// The guest chat's answers can take a little while.
export const maxDuration = 300;

/**
 * The way in: "How can we help you grow?" as a conversation; returning users sign in below it.
 * With ?next= (a link in one of our emails, e.g. "your action plan is ready") it's a sign-in that
 * lands there, or straight there when already signed in. ?cro=<slug> (from a public CRO page) starts
 * the chat with that CRO's AI chosen.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; cro?: string }> }) {
  const { next: raw, cro } = await searchParams;
  const next = raw ? safeNextPath(raw) : null;
  if (next && next !== "/") {
    if (await getCurrentUser()) redirect(next);
    return (
      <AuthShell brand={<Positioning compact />}>
        <ReturningSignIn next={next} open title="Log in to see your action plan" />
      </AuthShell>
    );
  }
  return <RallyLanding cro={cro} />;
}
