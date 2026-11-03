import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/invites";
import { AuthShell, Positioning } from "../AuthShell";
import { GuestEntry } from "../GuestEntry";
import { ReturningSignIn } from "../ReturningSignIn";

export const metadata: Metadata = { title: "Growth Goaled · Your Seed & Series A Stage CRO" };
// The guest chat's answers can take a little while.
export const maxDuration = 300;

/**
 * The way in: "How can we help you grow?" as a conversation; returning users sign in below it.
 * With ?next= (a link in one of our emails, e.g. "your action plan is ready") it's a sign-in that
 * lands there, or straight there when already signed in.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: raw } = await searchParams;
  const next = raw ? safeNextPath(raw) : null;
  if (next && next !== "/") {
    if (await getCurrentUser()) redirect(next);
    return (
      <AuthShell brand={<Positioning compact />}>
        <ReturningSignIn next={next} open title="Log in to see your action plan" />
      </AuthShell>
    );
  }
  return (
    <AuthShell brand={<Positioning compact />}>
      <GuestEntry />
    </AuthShell>
  );
}
