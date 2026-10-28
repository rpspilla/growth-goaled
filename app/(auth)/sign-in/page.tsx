import type { Metadata } from "next";
import { AuthShell, Positioning } from "../AuthShell";
import { MagicLinkForm } from "../MagicLinkForm";

export const metadata: Metadata = { title: "Sign in · Growth Goaled" };

export default function SignInPage() {
  return (
    <AuthShell brand={<Positioning compact />}>
      <h2 className="text-2xl sm:text-3xl font-semibold" style={{ color: "var(--foreground)", letterSpacing: "-0.01em" }}>Welcome back</h2>
      <p className="text-base mt-2 mb-6" style={{ color: "var(--muted-foreground)" }}>Enter your work email and we&apos;ll send you a sign-in link.</p>
      <MagicLinkForm mode="sign-in" />
    </AuthShell>
  );
}
