import type { ReactNode } from "react";
import { AuthShell, Positioning } from "./AuthShell";

/** Auth pages with a single title and form (e.g. invites), in the same split layout as sign-up. */
export function AuthCard({ title, subtitle, children }: { title: ReactNode; subtitle: string; children: ReactNode }) {
  return (
    <AuthShell brand={<Positioning compact />}>
      <h2 className="text-2xl sm:text-3xl font-semibold" style={{ color: "var(--foreground)", letterSpacing: "-0.01em" }}>{title}</h2>
      <p className="text-base mt-2 mb-6" style={{ color: "var(--muted-foreground)" }}>{subtitle}</p>
      {children}
    </AuthShell>
  );
}
