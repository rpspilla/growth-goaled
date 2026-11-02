import type { Metadata } from "next";
import { AuthShell, Positioning } from "../AuthShell";
import { GuestEntry } from "../GuestEntry";

export const metadata: Metadata = { title: "Growth Goaled · Your Seed & Series A Stage CRO" };
// The guest chat's answers can take a little while.
export const maxDuration = 300;

/** The way in: "How can we help you grow?" as a conversation; returning users sign in below it. */
export default function SignInPage() {
  return (
    <AuthShell brand={<Positioning compact />}>
      <GuestEntry />
    </AuthShell>
  );
}
