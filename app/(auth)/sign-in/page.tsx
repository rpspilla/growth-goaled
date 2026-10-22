import type { Metadata } from "next";
import { AuthCard } from "../AuthCard";
import { MagicLinkForm } from "../MagicLinkForm";

export const metadata: Metadata = { title: "Sign in · Growth Goaled" };

export default function SignInPage() {
  return (
    <AuthCard title={<>Welcome <em>back.</em></>} subtitle="We'll email you a secure link to sign in.">
      <MagicLinkForm mode="sign-in" />
    </AuthCard>
  );
}
