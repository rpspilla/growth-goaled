"use client";

import { useState } from "react";
import { MagicLinkForm } from "./MagicLinkForm";

/** Returning founders and advisors: the email sign-in link, one click away from the conversation. */
export function ReturningSignIn() {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-6 border-t" style={{ borderColor: "var(--border)" }}>
      {open ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Welcome back</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Enter your work email and we&apos;ll send you a sign-in link.</p>
          <MagicLinkForm mode="sign-in" />
        </div>
      ) : (
        <p className="text-sm text-center" style={{ color: "var(--muted-foreground)" }}>
          Already have an account?{" "}
          <button type="button" className="link font-semibold" onClick={() => setOpen(true)}>
            Sign in
          </button>
        </p>
      )}
    </div>
  );
}
