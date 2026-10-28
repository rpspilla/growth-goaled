import type { ReactNode } from "react";

/** Each auth page renders its own split layout (AuthShell). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
