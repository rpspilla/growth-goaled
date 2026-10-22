import type { Metadata } from "next";
import { AuthCard } from "../AuthCard";
import { MagicLinkForm } from "../MagicLinkForm";

export const metadata: Metadata = { title: "Create account · Growth Goaled" };

export default function SignUpPage() {
  return (
    <AuthCard
      title={<>Let&apos;s understand <em>your growth engine.</em></>}
      subtitle="Create your account and we'll email you a secure link to get started."
    >
      <MagicLinkForm mode="sign-up" />
    </AuthCard>
  );
}
