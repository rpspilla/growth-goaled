"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";

/** Same-site path to continue to after sign-in (e.g. an invite); anything else falls back to "/". */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/**
 * Magic links land here with ?neon_auth_session_verifier=… . The browser
 * client forwards the verifier to /api/auth/get-session, which sets our
 * session cookies; then a full reload of `next` (default /, which routes the
 * user by role).
 * Must stay outside the auth proxy matcher, or the verifier is dropped.
 */
export default function AuthCallbackPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    authClient
      .getSession()
      .then(({ data }) => {
        if (data?.session) window.location.replace(nextPath());
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-8" style={{ background: "var(--navy)" }}>
      <div className="text-center max-w-sm" style={{ animation: "fadeIn 0.2s ease-out" }}>
        {failed ? (
          <>
            <h1 className="font-display text-3xl font-normal mb-3" style={{ color: "#fff" }}>
              That link didn&apos;t work.
            </h1>
            <p className="text-sm mb-6" style={{ color: "#7A98B4" }}>
              Sign-in links expire after a few minutes and can be used once. Request a new one.
            </p>
            <Link
              href="/sign-in"
              className="inline-block px-6 py-3 rounded-lg font-semibold text-sm"
              style={{ background: "var(--green)", color: "#fff" }}
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <p className="text-sm" style={{ color: "#7A98B4" }}>Signing you in…</p>
        )}
      </div>
    </div>
  );
}
